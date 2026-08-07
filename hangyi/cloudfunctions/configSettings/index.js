/**
 * configSettings - 一次性配置脚本(云函数)
 * 用于 demo 联调:把 hangyi 同步配置写入 settings 集合。
 * 调用方式: wx.cloud.callFunction({ name: 'configSettings', data: { action: 'apply' } })
 * 幂等:重复调用只更新已有记录,不重复插入。
 */
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const SETTINGS_COLLECTION = "settings";

// 要写入的配置项(来自服务器 .env INTERNAL_API_KEY + 公网入口)
const CONFIG = {
  hangyiSyncEnabled: "true",
  hangyiApiUrl: "https://gateway.example.com",
  hangyiApiKey: "REPLACE_WITH_INTERNAL_API_KEY_FROM_ENV",
};

const setSetting = async (key, value) => {
  const res = await db.collection(SETTINGS_COLLECTION).where({ key }).limit(1).get();
  if (res.data.length) {
    await db.collection(SETTINGS_COLLECTION).doc(res.data[0]._id).update({
      data: { value, updatedAt: new Date() },
    });
    return { key, updated: true };
  } else {
    await db.collection(SETTINGS_COLLECTION).add({
      data: { key, value, createdAt: new Date(), updatedAt: new Date() },
    });
    return { key, created: true };
  }
};

exports.main = async (event = {}) => {
  const action = event.action || "apply";
  if (action === "apply") {
    const results = [];
    for (const [key, value] of Object.entries(CONFIG)) {
      results.push(await setSetting(key, value));
    }
    return { code: 0, message: "settings applied", data: results };
  }
  if (action === "read") {
    const res = await db.collection(SETTINGS_COLLECTION).where({
      key: db.command.in(["REPLACE_WITH_INTERNAL_API_KEY_FROM_ENV", "REPLACE_WITH_INTERNAL_API_KEY_FROM_ENV", "REPLACE_WITH_INTERNAL_API_KEY_FROM_ENV"]),
    }).get();
    return { code: 0, message: "ok", data: res.data };
  }
  if (action === "sample") {
    // 读取 staff / operation_logs / leave_requests 各一条样例,看字段实际值
    const out = {};
    for (const name of ["staff", "operation_logs", "leave_requests", "schedules"]) {
      try {
        const r = await db.collection(name).limit(1).get();
        out[name] = r.data[0] || null;
      } catch (e) {
        out[name] = "err:" + e.errMsg;
      }
    }
    return { code: 0, message: "ok", data: out };
  }
  if (action === "count") {
    // 统计各集合数据量,判断同步是否有数据可推
    const collections = ["staff", "flights", "schedules", "swap_requests", "leave_requests", "operation_logs", "settings", "sync_state"];
    const counts = {};
    for (const name of collections) {
      try {
        const r = await db.collection(name).count();
        counts[name] = r.total;
      } catch (e) {
        counts[name] = "err:" + e.errMsg;
      }
    }
    return { code: 0, message: "ok", data: counts };
  }
  if (action === "groupIds") {
    // 统计 staff 集合里所有不同的 groupId 值,看有哪些格式
    const r = await db.collection("staff").field({ groupId: true }).limit(1000).get();
    const seen = {};
    for (const item of r.data) {
      const g = String(item.groupId || "(empty)");
      seen[g] = (seen[g] || 0) + 1;
    }
    return { code: 0, message: "ok", data: seen };
  }
  if (action === "emptyGroup") {
    // 找出 groupId 为空/缺失的 staff
    const r1 = await db.collection("staff").where({ groupId: _.in([null, "", " "]) }).field({ employeeNo: true, name: true, groupId: true }).get();
    const r2 = await db.collection("staff").where({ groupId: _.exists(false) }).field({ employeeNo: true, name: true, groupId: true }).get();
    return { code: 0, message: "ok", data: { emptyOrNull: r1.data, missing: r2.data } };
  }
  if (action === "schedFlights") {
    // 统计 schedules 里引用的所有航班号
    const r = await db.collection("schedules").field({ flightNo: true, scheduleDate: true }).limit(500).get();
    const byNo = {};
    const rows = [];
    for (const item of r.data) {
      const no = String(item.flightNo || "(empty)");
      byNo[no] = (byNo[no] || 0) + 1;
      rows.push({ flightNo: no, scheduleDate: item.scheduleDate });
    }
    return { code: 0, message: "ok", data: { counts: byNo, rows } };
  }
  if (action === "flightNos") {
    // 统计 flights 集合里所有航班号
    const r = await db.collection("flights").field({ flightNo: true }).limit(1000).get();
    const byNo = {};
    for (const item of r.data) {
      const no = String(item.flightNo || "(empty)");
      byNo[no] = (byNo[no] || 0) + 1;
    }
    return { code: 0, message: "ok", data: byNo };
  }
  if (action === "flightSample") {
    // 查 flights 里 aircraftType 的原始值(看是否源数据乱码)
    const r = await db.collection("flights").where({ flightNo: _.in(["FLOW26072001", "SIM121842", "FLOW26072105"]) }).field({ flightNo: true, aircraftType: true, engineModel: true }).get();
    return { code: 0, message: "ok", data: r.data };
  }
  if (action === "groupUsers") {
    // 列出 groupId 为 group_a 的 staff(确认是否应属 A组)
    const r = await db.collection("staff").where({ groupId: "group_a" }).field({ employeeNo: true, name: true, groupId: true }).get();
    return { code: 0, message: "ok", data: r.data };
  }
  if (action === "fixGroupA") {
    // 把 groupId=group_a 的 staff 改成 A组(历史下划线格式 → 中文格式)
    const r = await db.collection("staff").where({ groupId: "group_a" }).get();
    let updated = 0;
    for (const item of r.data) {
      await db.collection("staff").doc(item._id).update({
        data: { groupId: "A组", updatedAt: new Date() },
      });
      updated++;
    }
    return { code: 0, message: "ok", data: { updated } };
  }
  return { code: -1, message: `未知 action: ${action}` };
};
