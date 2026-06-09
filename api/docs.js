const { google } = require('googleapis');

const FOLDER_MAP = [
  { id: '1skVlX3MS5cDXCtrj5m_knAd81tyUItYT', cat: 0, label: 'VAL' },
  { id: '15rzjL5sBzbQvB-YzRHD_7tGAcXoonk7G', cat: 1, label: 'QM' },
  { id: '1b7xTao1IbYmClP8LN4TPn253wZ1Vqxot', cat: 2, label: 'SOP' },
  { id: '1gF0Ad0Bxs84whaXrcTTMhNkvH592MuAD', cat: 3, label: 'WI' },
  { id: '1BstsKyM8hS6LvkVt9BS1X5fmOlti54RI', cat: 4, label: 'FORM' },
  { id: '1vWWnjJV2So4eI6-Hcotq-eV0byjj3Hyb', cat: 5, label: 'OTHER' },
];

function mimeToViewUrl(fileId, mimeType) {
  if (mimeType === 'application/vnd.google-apps.document')
    return 'https://docs.google.com/document/d/' + fileId + '/edit';
  if (mimeType === 'application/vnd.google-apps.spreadsheet')
    return 'https://docs.google.com/spreadsheets/d/' + fileId + '/edit';
  if (mimeType === 'application/vnd.google-apps.presentation')
    return 'https://docs.google.com/presentation/d/' + fileId + '/edit';
  return 'https://drive.google.com/file/d/' + fileId + '/view';
}

function parseFileName(title) {
  const verMatch = title.match(/[\-_\s]\(([A-Z0-9]+)\)/);
  const ver = verMatch ? 'Rev.' + verMatch[1] : 'Rev.-';
  const codeMatch = title.match(/^([A-Z0-9][A-Z0-9\-]*[A-Z0-9])/);
  const code = codeMatch ? codeMatch[1] : title.substring(0, 20);
  const name = title.replace(/\.[a-z]{2,5}$/i, '').replace(/_\d{8}$/, '').trim();
  return { code: code, ver: ver, name: name || title };
}

async function scanOneLevelFolder(drive, folderId) {
  var folders = [];
  var files = [];
  var pageToken = null;
  do {
    var params = {
      q: "'" + folderId + "' in parents and trashed=false",
      fields: 'nextPageToken, files(id,name,mimeType,modifiedTime)',
      pageSize: 200,
    };
    if (pageToken) params.pageToken = pageToken;
    var res = await drive.files.list(params);
    var items = res.data.files || [];
    for (var i = 0; i < items.length; i++) {
      var file = items[i];
      if (file.mimeType === 'application/vnd.google-apps.folder') {
        folders.push({ id: file.id, name: file.name });
      } else {
        files.push(file);
      }
    }
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return { folders: folders, files: files };
}

async function scanAllFiles(drive, folderId, cat, docs) {
  var params = {
    q: "'" + folderId + "' in parents and trashed=false",
    fields: 'nextPageToken, files(id,name,mimeType,modifiedTime)',
    pageSize: 200,
  };
  var res = await drive.files.list(params);
  var items = res.data.files || [];
  for (var i = 0; i < items.length; i++) {
    var file = items[i];
    if (file.mimeType === 'application/vnd.google-apps.folder') {
      await scanAllFiles(drive, file.id, cat, docs);
    } else {
      if (!file.name || !file.name.trim()) continue;
      var parsed = parseFileName(file.name);
      docs.push({
        code: parsed.code,
        ver: parsed.ver,
        name: parsed.name,
        cat: cat,
        status: 'active',
        date: (file.modifiedTime || '').substring(0, 10),
        dept: 'dept',
        viewUrl: mimeToViewUrl(file.id, file.mimeType),
      });
    }
  }
}

async function buildCat5(drive, rootId) {
  var level1 = await scanOneLevelFolder(drive, rootId);
  var rootFiles = level1.files.map(function(f) {
    return {
      name: f.name.replace(/\.[a-z]{2,5}$/i, '').trim(),
      viewUrl: mimeToViewUrl(f.id, f.mimeType),
      date: (f.modifiedTime || '').substring(0, 10),
    };
  });
  var folders = [];
  for (var i = 0; i < level1.folders.length; i++) {
    var folder = level1.folders[i];
    var innerDocs = [];
    await scanAllFiles(drive, folder.id, 5, innerDocs);
    folders.push({
      id: folder.id,
      name: folder.name,
      files: innerDocs,
    });
  }
  folders.sort(function(a, b) { return a.name.localeCompare(b.name); });
  return { rootFiles: rootFiles, folders: folders };
}

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    var credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    var auth = new google.auth.GoogleAuth({
      credentials: credentials,
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });
    var drive = google.drive({ version: 'v3', auth: auth });

    var allDocs = [];
    for (var i = 0; i < FOLDER_MAP.length; i++) {
      var folder = FOLDER_MAP[i];
      if (folder.cat === 5) continue;
      try {
        await scanAllFiles(drive, folder.id, folder.cat, allDocs);
      } catch(err) {
        console.error('Error ' + folder.label + ': ' + err.message);
      }
    }
    allDocs.sort(function(a, b) { return a.code.localeCompare(b.code); });

    var cat5 = { rootFiles: [], folders: [] };
    try {
      cat5 = await buildCat5(drive, FOLDER_MAP[5].id);
    } catch(err) {
      console.error('Error cat5: ' + err.message);
    }

    return res.status(200).json({
      success: true,
      docs: allDocs,
      cat5: cat5,
      updatedAt: new Date().toISOString(),
    });
  } catch(err) {
    console.error('API Error: ' + err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};
