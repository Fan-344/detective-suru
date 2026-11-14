// 圖片素材的查找。資料裡只寫一個代號（例如 "zonghan"、"snack"），這裡換成實際的檔案網址。
// 找不到檔案時回傳 undefined，畫面會退回佔位的樣子。
const AVATARS = import.meta.glob<string>('./assets/avatars/*.jpg', { eager: true, import: 'default' });
const PHOTOS = import.meta.glob<string>('./assets/photos/*.jpg', { eager: true, import: 'default' });

export const avatarUrl = (key?: string): string | undefined => (key ? AVATARS[`./assets/avatars/${key}.jpg`] : undefined);
export const photoUrl = (key?: string): string | undefined => (key ? PHOTOS[`./assets/photos/${key}.jpg`] : undefined);
