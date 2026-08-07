const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const https = require("https");
const http = require("http");

const SETTINGS = "settings";
const SYNC_STATE = "sync_state";
const MAX_RESPONSE_BYTES = 1024 * 1024;

const COLLECTIONS = {
  staff: "staff",
  flights: "flights",
  schedules: "schedules",
  swap_requests: "swap_requests",
  // leave_requests 暂时跳过:服务器后端没有对应 /api/sync/leave-requests 端点
  operation_logs: "operation_logs",
};

const SYNC_ENDPOINTS = {
  staff: "/api/sync/staff",
  flights: "/api/sync/flights",
  schedules: "/api/sync/schedules",
  swap_requests: "/api/sync/swap-requests",
  leave_requests: "/api/sync/leave-requests",
  operation_logs: "/api/sync/operation-logs",
};

const getSetting = async (key) => {
  const res = await db.collection(SETTINGS).where({ key }).limit(1).get();
  return res.data.length ? res.data[0].value : null;
};

const isPrivateHostname = (hostname) => {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")) return true;
  const parts = host.split(".");
  if (parts.length !== 4 || !parts.every((part) => /^\d{1,3}$/.test(part))) return false;
  const nums = parts.map(Number);
  if (nums.some((num) => num < 0 || num > 255)) return true;
  return nums[0] === 10
    || nums[0] === 127
    || (nums[0] === 169 && nums[1] === 254)
    || (nums[0] === 172 && nums[1] >= 16 && nums[1] <= 31)
    || (nums[0] === 192 && nums[1] === 168);
};

const buildTargetUrl = (baseUrl, endpoint) => {
  const base = new URL(baseUrl);
  const isOriginOnly = (base.pathname === "/" || base.pathname === "")
    && !base.search && !base.hash && !base.username && !base.password;
  // DEMO 联调放宽：允许 http 连内网/公网 IP（不上生产）。生产应改回 https 严格校验。
  const schemeOk = base.protocol === "https:" || base.protocol === "http:";
  if (!schemeOk || !isOriginOnly || isPrivateHostname(base.hostname)) {
    throw new Error("hangyiApiUrl 必须是公网 http(s) origin");
  }
  return new URL(endpoint, base.origin);
};

const callApi = (baseUrl, apiKey, caPem, endpoint, payload) => {
  let urlObj;
  try {
    urlObj = buildTargetUrl(baseUrl, endpoint);
  } catch (error) {
    return Promise.reject(error);
  }
  const postData = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === "http:" ? 80 : 443),
      path: urlObj.pathname + urlObj.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-API-Key": apiKey || "",
        "Content-Length": Buffer.byteLength(postData),
      },
      timeout: 15000,
    };
    // 默认使用 Node 的受信 CA。自签证书必须通过 settings.hangyiApiCaPem 显式配置。
    if (caPem) options.ca = caPem;

    const isHttps = urlObj.protocol === "https:";
    const mod = isHttps ? https : http;
    const req = mod.request(options, (res) => {
      const chunks = [];
      let size = 0;
      res.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) {
          req.destroy(new Error("Hangyi 服务响应过大"));
          return;
        }
        chunks.push(chunk);
      });
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        try {
          JSON.parse(body);
          // 必须检查 statusCode，否则 4xx/5xx 响应也会被当成成功
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${body}`));
          }
        } catch {
          reject(new Error(body));
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    req.write(postData);
    req.end();
  });
};

const getSyncCursor = async () => {
  try {
    const res = await db
      .collection(SYNC_STATE)
      .where({ key: "last_sync_time" })
      .limit(1)
      .get();
    if (!res.data.length) return { lastSync: null, initialSync: true };
    const lastSync = new Date(res.data[0].value);
    if (Number.isNaN(lastSync.getTime())) {
      console.warn("SyncToHangyi: invalid cursor, starting a safe full sync");
      return { lastSync: null, initialSync: true };
    }
    return { lastSync, initialSync: false };
  } catch (e) {
    if (e.errCode === -502005) {
      await db.createCollection(SYNC_STATE);
      // 同步状态集合不存在代表从未成功同步。不能只回溯 10 分钟，
      // 否则在启用 Java 联动前已存在的员工、航班和排班会永久丢失。
      return { lastSync: null, initialSync: true };
    }
    throw e;
  }
};

const setLastSyncTime = async (time) => {
  try {
    const res = await db
      .collection(SYNC_STATE)
      .where({ key: "last_sync_time" })
      .limit(1)
      .get();
    const val = time.toISOString();
    if (res.data.length) {
      await db
        .collection(SYNC_STATE)
        .doc(res.data[0]._id)
        .update({ data: { value: val, updatedAt: new Date() } });
    } else {
      await db
        .collection(SYNC_STATE)
        .add({
          data: {
            key: "last_sync_time",
            value: val,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
    }
  } catch (e) {
    if (e.errCode === -502005) {
      await db.createCollection(SYNC_STATE);
      await db.collection(SYNC_STATE).add({
        data: {
          key: "last_sync_time",
          value: time.toISOString(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    } else {
      throw e;
    }
  }
};

exports.main = async (event, context) => {
  const enabled =
    String((await getSetting("hangyiSyncEnabled")) || "false") === "true";
  if (!enabled) return { code: 0, message: "sync disabled" };

  const baseUrl = await getSetting("hangyiApiUrl");
  if (!baseUrl)
    return { code: -1, message: "hangyiApiUrl not configured" };
  const apiKey = (await getSetting("hangyiApiKey")) || "";
  const caPem = (await getSetting("hangyiApiCaPem")) || "";

  const cursor = await getSyncCursor();
  const { lastSync, initialSync } = cursor;
  const now = new Date();
  const since = lastSync ? lastSync.toISOString() : null;

  console.log(initialSync
    ? "SyncToHangyi: no cursor, starting paginated full sync"
    : `SyncToHangyi: fetching changes since ${since}`);

  let totalSynced = 0;
  const syncErrors = [];
  const BATCH_SIZE = 30;

  for (const collName of Object.keys(COLLECTIONS)) {
    const coll = COLLECTIONS[collName];
    let skip = 0;
    let hasMore = true;
    while (hasMore) {
      try {
        let query = db.collection(coll);
        if (!initialSync) query = query.where({ updatedAt: db.command.gte(lastSync) });
        const res = await query.orderBy("_id", "asc").skip(skip).limit(BATCH_SIZE).get();
        if (res.data.length > 0) {
          console.log(`  ${collName}: ${res.data.length} records (skip=${skip})`);
          try {
            let payload = res.data;
            // DEMO 适配: operation_logs 的 target 是对象,服务器 target_id varchar(100)
            // 序列化会超长。这里把 target 压缩成短字符串再推送(服务器零改动)。
            if (collName === "operation_logs") {
              payload = res.data.map((rec) => {
                const out = { ...rec };
                if (typeof out.target === "object" && out.target !== null) {
                  try {
                    const s = JSON.stringify(out.target);
                    out.target = s.length > 90 ? s.slice(0, 90) + "…" : s;
                  } catch (_) {
                    out.target = String(out.target).slice(0, 90);
                  }
                }
                if (out.target === undefined || out.target === null) out.target = "";
                return out;
              });
            }
            await callApi(baseUrl, apiKey, caPem, SYNC_ENDPOINTS[collName], payload);
            totalSynced += res.data.length;
            skip += res.data.length;
          } catch (e) {
            console.error(`  ${collName}: push failed - ${e.message}`);
            syncErrors.push({ collection: collName, error: e.message });
            hasMore = false;
          }
          if (res.data.length < BATCH_SIZE) hasMore = false;
        } else {
          hasMore = false;
        }
      } catch (e) {
        console.error(`  ${collName}: error - ${e.message}`);
        syncErrors.push({ collection: collName, error: e.message });
        hasMore = false;
      }
    }
  }

  console.log(`SyncToHangyi: pushed ${totalSynced} records total`);

  // 任一集合失败时保留旧游标，下次重试，避免失败批次被永久跳过。
  if (syncErrors.length === 0) {
    await setLastSyncTime(now);
  }
  return {
    code: syncErrors.length === 0 ? 0 : -1,
    message: syncErrors.length === 0 ? "ok" : "partial failure; cursor preserved",
    synced: totalSynced,
    errors: syncErrors,
    initialSync,
    since,
    until: now.toISOString(),
  };
};
