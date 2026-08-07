const chooseReasonImages = async (currentItems = [], maxCount = 6) => {
  const current = Array.isArray(currentItems) ? currentItems : [];
  const remain = Math.max(0, maxCount - current.length);
  if (!remain) throw new Error(`最多上传 ${maxCount} 张图片`);

  const result = await wx.chooseMedia({
    count: remain,
    mediaType: ["image"],
    sourceType: ["album", "camera"],
    sizeType: ["compressed"],
  });
  const next = (result.tempFiles || [])
    .filter((item) => item && item.tempFilePath && Number(item.size || 0) <= 10 * 1024 * 1024)
    .map((item) => ({
      path: item.tempFilePath,
      fileID: "",
      size: Number(item.size || 0),
    }));
  if (!next.length) throw new Error("未选择有效图片，单张图片需小于 10MB");
  return current.concat(next).slice(0, maxCount);
};

const uploadReasonImages = async (items = [], category = "request") => {
  const safeCategory = String(category || "request").replace(/[^a-z0-9_-]/gi, "").slice(0, 30) || "request";
  const uploaded = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index] || {};
    if (item.fileID) {
      uploaded.push(item);
      continue;
    }
    if (!item.path) throw new Error("图片本地路径已失效，请重新选择");
    const cleanPath = String(item.path).split("?")[0];
    const rawExt = cleanPath.includes(".") ? cleanPath.split(".").pop().toLowerCase() : "jpg";
    const ext = /^[a-z0-9]{2,5}$/.test(rawExt) ? rawExt : "jpg";
    const cloudPath = `request-reasons/${safeCategory}/${Date.now()}_${index}_${Math.random()
      .toString(36)
      .slice(2, 10)}.${ext}`;
    const result = await wx.cloud.uploadFile({
      cloudPath,
      filePath: item.path,
    });
    if (!result || !result.fileID) throw new Error("图片上传失败");
    uploaded.push({ ...item, fileID: result.fileID });
  }
  return uploaded;
};

const previewReasonImages = (items = [], currentIndex = 0) => {
  const urls = (Array.isArray(items) ? items : [])
    .map((item) => item && (item.fileID || item.path || item))
    .filter(Boolean);
  if (!urls.length) return;
  const current = urls[Math.max(0, Math.min(Number(currentIndex) || 0, urls.length - 1))];
  wx.previewImage({ current, urls });
};

module.exports = {
  chooseReasonImages,
  uploadReasonImages,
  previewReasonImages,
};
