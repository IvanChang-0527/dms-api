const { google } = require('googleapis');

const FOLDER_MAP = [
  { id: '1skVlX3MS5cDXCtrj5m_knAd81tyUItYT', cat: 0, label: '驗證方案' },
  { id: '15rzjL5sBzbQvB-YzRHD_7tGAcXoonk7G', cat: 1, label: '1品質手冊' },
  { id: '1b7xTao1IbYmClP8LN4TPn253wZ1Vqxot', cat: 2, label: '2程序書' },
  { id: '1gF0Ad0Bxs84whaXrcTTMhNkvH592MuAD', cat: 3, label: '3作業指導書' },
  { id: '1BstsKyM8hS6LvkVt9BS1X5fmOlti54RI', cat: 4, label: '4表單' },
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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

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
        const response = await drive.files.list({
          q: `'${folder.id}' in parents and trashed=false and mimeType != 'application/vnd.google-apps.folder'`,
          fields: 'files(id,name,mimeType,modifiedTime)',
          pageSize: 200,
        });

        const files = response.data.files || [];
        for (const file of files) {
          if (!file.name || file.name.trim() === '') continue;
          const { code, ver, name } = parseFileName(file.name);
          allDocs.push({
            code,
            ver,
            name,
            cat: folder.cat,
            status: 'active',
            date: (file.modifiedTime || '').substring(0, 10),
            dept: '船舶暨海洋產業研發中心',
            viewUrl: mimeToViewUrl(file.id, file.mimeType),
          });
        }
      } catch (err) {
        console.error(`Error fetching folder ${folder.label}:`, err.message);
      }
    }

    allDocs.sort((a, b) => a.code.localeCompare(b.code));
    return res.status(200).json({ success: true, docs: allDocs, updatedAt: new Date().toISOString() });

  } catch (err) {
    console.error('API Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};
