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
