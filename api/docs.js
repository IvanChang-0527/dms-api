const { google } = require('googleapis');

const FOLDER_MAP = [
  { id: '1skVlX3MS5cDXCtrj5m_knAd81tyUItYT', cat: 0, label: '驗證方案' },
  { id: '15rzjL5sBzbQvB-YzRHD_7tGAcXoonk7G', cat: 1, label: '1品質手冊' },
  { id: '1b7xTao1IbYmClP8LN4TPn253wZ1Vqxot', cat: 2, label: '2程序書' },
  { id: '1gF0Ad0Bxs84whaXrcTTMhNkvH592MuAD', cat: 3, label: '3作業指導書' },
  { id: '1BstsKyM8hS6LvkVt9BS1X5fmOlti54RI', cat: 4, label: '4表單' },
  { id: '1vWWnjJV2So4eI6-Hcotq-eV0byjj3Hyb', cat: 5, label: '5其他(評鑑用)' },
];

function mimeToViewUrl(fileId, mimeType) {
  if (mimeType === 'application/vnd.google-apps.document')
    return `https://docs.google.com/document/d/${fileId}/edit`;
  if (mimeType === 'application/vnd.google-apps.spreadsheet')
    return `https://docs.google.com/spreadsheets/d/${fileId}/edit`;
  if (mimeType === 'application/vnd.google-apps.presentation')
    return `https://docs.google.com/presentation/d/${fileId}/edit`;
  return `https://drive.google.com/file/d/${fileId}/view`;
}

function parseFileName(title) {
  const verMatch = title.match(/[\-_\s]\(([A-Z0-9]+)\)/);
  const ver = verMatch ? `Rev.${verMatch[1]}` : 'Rev.—';
  const codeMatch = title.match(/^([A-Z0-9][A-Z0-9\-]*[A-Z0-9])/);
  const code = codeMatch ? codeMatch[1] : title.substring(0, 20);
  const name = title
    .replace(/\.[a-z]{2,5}$/i, '')
    .replace(/_\d{8}$/, '')
    .trim();
  return { code, ver, name: name || title };
}

// 遞迴掃描資料夾（含所有子資料夾）
async function scanFolder(drive, folderId, cat, docs) {
  let pageToken = null;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'nextPageToken, files(id,name,mimeType,modifiedTime)',
      pageSize: 200,
      pageToken: pageToken || undefined,
    });

    for (const file of res.data.files || []) {
      if (file.mimeType === 'application/vnd.google-apps.folder') {
        // 遞迴掃描子資料夾
        await scanFolder(drive, file.id, cat, docs);
      } else {
        if (!file.name || file.name.trim() === '') continue;
        const { code, ver, name } = parseFileName(file.name);
        docs.push({
          code,
          ver,
          name,
          cat,
          status: 'active',
          date: (file.modifiedTime || '').substring(0, 10),
          dept: '船舶暨海洋產業研發中心',
          viewUrl: mimeToViewUrl(file.id, file.mimeType),
        });
      }
    }
    pageToken = res.data.nextPageToken;
  } while (pageToken);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });

    const drive = google.drive({ version: 'v3', auth });
    const allDocs = [];

    for (const folder of FOLDER_MAP) {
      try {
        await scanFolder(drive, folder.id, folder.cat, allDocs);
      } catch (err) {
        console.error(`Error scanning folder ${folder.label}:`, err.message);
      }
    }

    allDocs.sort((a, b) => a.code.localeCompare(b.code));
    return res.status(200).json({
      success: true,
      docs: allDocs,
      updatedAt: new Date().toISOString(),
    });

  } catch (err) {
    console.error('API Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};
