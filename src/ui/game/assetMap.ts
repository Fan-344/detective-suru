// 資料裡的哪一筆對到哪一張圖。圖檔在 src/ui/assets/photos/<代號>.jpg。
// 頭像不用對照表，直接用角色的 id 當檔名（src/ui/assets/avatars/<角色 id>.jpg）。
// 這張表只管「畫面要拿哪個檔案」，不含任何劇情。
export const PHOTO_OF_ITEM: Record<string, string> = {
  ph_boxes: 'boxes',
  ph_ipad: 'ipad',
  ph_fileinfo_cover: 'fileinfo_cover',
  ph_fileinfo_inner: 'fileinfo_inner',
  ph_compare: 'compare',
  ph_deposit: 'deposit',
  ph_roster: 'roster',
  say_aze_rain: 'rain',
  say_py_snack: 'snack',
  mo_sat_market: 'market',
};

// 聊天室裡沒有對應資料項目的照片（只是一則訊息裡的圖）：用「聊天室 id#第幾則舊訊息」對。
// 這是暫時的做法。資料檔的圖片有 file 欄位，文本那邊填了之後以它為準，這張表就可以拿掉。
export const PHOTO_OF_MESSAGE: Record<string, string> = {
  'dm_pinyu#0': 'roster',
};

/** 資料檔寫的檔名（例如 roster.jpg）換成圖檔的代號 */
export const photoKeyOfFile = (file: string | undefined): string | undefined => (file ? file.replace(/^.*\//, '').replace(/\.[a-z0-9]+$/i, '') : undefined);
