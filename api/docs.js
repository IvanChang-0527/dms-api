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
  const name = title.replace(/\.[a-z]{2,5}$/i, '').replace(/_\d{8}$/, '').trim();
  return { code, ver, name: name || title };
}

// 掃描一層（不遞迴），回傳 { folders, files }
async function scanOneLevelFolder(drive, folderId) {
  const folders = [];
  const files = [];
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
        folders.push({ id: file.id, name: file.name });
      } else {
        files.push(file);
      }
    }
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return { folders, files };
}

// 遞迴掃描（用於 cat 0-4）
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
        await scanFolder(drive, file.id, cat, docs);
      } else {
        if (!file.name || !file.name.trim()) continue;
        const { code, ver, name } = parseFileName(file.name);
        docs.push({
          code, ver, name, cat, status: 'active',
          date: (file.modifiedTime || '').substring(0, 10),
          dept: '船舶暨海洋產業研發中心',
          viewUrl: mimeToViewUrl(file.id, file.mimeType),
        });
      }
    }
    pageToken = res.data.nextPageToken;
  } while (pageToken);
}

// 掃描 cat5 資料夾結構（只掃一層子資料夾，子資料夾內的檔案也抓）
async function scanCat5(drive, rootId) {
  const { folders: subFolders, files: rootFiles } = await scanOneLevelFolder(drive, rootId);

  const result = {
    rootFiles: rootFiles.map(f => ({
      id: f.id, name: f.name.replace(/\.[a-z]{2,5}$/i,'').trim(),
      viewUrl: mimeToViewUrl(f.id, f.mimeType),
      date: (f.modifiedTime||'').substring(0,10),
    })),
    folders: [],
  };

  for (const folder of subFolders) {
    const folderFiles = 
