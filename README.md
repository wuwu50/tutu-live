# 兔兔直播

獨立公開的 YouTube 播放清單網站，只包含網頁、影片標題與發布日期、自動同步腳本和測試，不包含桌寵程式、金鑰、原始照片或私人儲存庫歷史。

播放清單：https://www.youtube.com/playlist?list=PLNy9F-I7PWD0

預定網址：https://wuwu50.github.io/tutu-live/

發布：GitHub Settings → Pages → Source 選 GitHub Actions。Rabbit Live website 工作流程負責發布並每小時更新標題與發布日期；取得失敗時保留既有快取。影片日期是台灣時間的 YouTube 發布日期，並非拍攝日期。

測試：Node.js 24 執行 node tests/live-site-check.mjs。無需安裝套件或 API 金鑰。
