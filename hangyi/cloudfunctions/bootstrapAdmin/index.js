/**
 * 首个管理员控制台自举函数。
 *
 * 安全边界：
 * 1. 只允许云开发控制台直接执行，拒绝带 OPENID 或客户端 SOURCE 的调用。
 * 2. 只在系统尚无可用管理员时生效；可清理未绑定或已停用的旧管理员。
 * 3. 目标员工必须已经登录并绑定 OPENID，避免创建无法使用的管理员。
 */
const cloud = require("wx-server-sdk");
const { getCloudbaseContext } = require("@cloudbase/node-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const STAFF_COLLECTION = "staff";
const LOG_COLLECTION = "operation_logs";
const CONFIRM_TEXT = "CREATE_FIRST_ADMIN";
const NON_CONSOLE_SOURCES = new Set([
  "wx_client",
  "wx_devtools",
  "wx_localdebug",
  "wx_http",
  "wx_unknown",
  "wx_trigger",
  "wx_paycallback",
  "wx_crawler",
  "web_client",
  "scf",
]);

const ok = (data = null, message = "ok") => ({ code: 0, message, data });
const fail = (message, code, data = null) => ({ code, message, data });

const readPayload = (event) => {
  if (event && event.data && typeof event.data === "object" && !Array.isArray(event.data)) {
    return event.data;
  }
  return event && typeof event === "object" && !Array.isArray(event) ? event : {};
};

const readInvocationContext = (context, wxContext) => {
  try {
    const current = getCloudbaseContext(context || {});
    return {
      openid: typeof current.WX_OPENID === "string" ? current.WX_OPENID : "",
      source: typeof current.TCB_SOURCE === "string" ? current.TCB_SOURCE : "",
    };
  } catch (_) {
    return {
      openid: typeof wxContext.OPENID === "string" ? wxContext.OPENID : "",
      source: typeof wxContext.SOURCE === "string" ? wxContext.SOURCE : "",
    };
  }
};

exports.main = async (event, context) => {
  try {
    const wxContext = cloud.getWXContext() || {};
    const invocation = readInvocationContext(context, wxContext);
    const source = invocation.source.trim();
    const sourceChain = source.split(",").map((item) => item.trim()).filter(Boolean);
    const hasNonConsoleSource = sourceChain.some((item) => NON_CONSOLE_SOURCES.has(item));
    if (invocation.openid || hasNonConsoleSource) {
      return fail("该函数只能在云开发控制台执行，禁止从客户端调用", 403);
    }

    const payload = readPayload(event);
    const employeeNo = typeof payload.employeeNo === "string"
      ? payload.employeeNo.trim().toUpperCase()
      : "";
    const confirmText = typeof payload.confirmText === "string"
      ? payload.confirmText.trim()
      : "";

    if (!/^[A-Z0-9_-]{1,30}$/.test(employeeNo)) {
      return fail("employeeNo 格式不正确", 400);
    }
    if (confirmText !== CONFIRM_TEXT) {
      return fail(`confirmText 必须为 ${CONFIRM_TEXT}`, 400);
    }

    const adminResult = await db
      .collection(STAFF_COLLECTION)
      .where({ isAdmin: true })
      .limit(100)
      .get();
    const existingAdmins = adminResult.data || [];
    const usableAdmin = existingAdmins.find((staff) =>
      staff.active !== false &&
      typeof staff.openid === "string" &&
      !!staff.openid.trim()
    );
    if (usableAdmin) {
      return fail("系统已存在管理员，请由现有管理员授权其他账号", 409, {
        adminEmployeeNo: usableAdmin.employeeNo || "",
      });
    }

    const targetResult = await db
      .collection(STAFF_COLLECTION)
      .where({ employeeNo })
      .limit(1)
      .get();
    const target = (targetResult.data || [])[0];
    if (!target) {
      return fail("未找到该员工，请先在小程序完成登录或注册", 404);
    }
    if (target.active === false) {
      return fail("该员工账号已停用，不能设为管理员", 409);
    }
    if (typeof target.openid !== "string" || !target.openid.trim()) {
      return fail("该员工尚未绑定微信，请先使用该工号登录小程序", 409);
    }

    const now = new Date();
    const revokedStaleAdmins = [];
    for (const staleAdmin of existingAdmins) {
      if (staleAdmin._id === target._id) continue;
      await db.collection(STAFF_COLLECTION).doc(staleAdmin._id).update({
        data: {
          isAdmin: false,
          adminRevokedAt: now,
          adminRevokedBy: "CLOUD_CONSOLE_BOOTSTRAP_RECOVERY",
          updatedAt: now,
        },
      });
      revokedStaleAdmins.push(staleAdmin.employeeNo || "");
    }

    await db.collection(STAFF_COLLECTION).doc(target._id).update({
      data: {
        isAdmin: true,
        adminGrantedAt: now,
        adminGrantedBy: "CLOUD_CONSOLE_BOOTSTRAP",
        updatedAt: now,
      },
    });

    try {
      await db.collection(LOG_COLLECTION).add({
        data: {
          action: "BOOTSTRAP_FIRST_ADMIN",
          description: `${target.name || employeeNo}（${employeeNo}）成为首个管理员`,
          operatorOpenid: "",
          target: {
            type: "staff",
            employeeNo,
            source: "bootstrapAdmin",
          },
          createdAt: now,
        },
      });
    } catch (_) {
      // 审计集合异常不回滚已经完成的首次管理员授权。
    }

    return ok({
      employeeNo,
      name: target.name || target.realName || employeeNo,
      isAdmin: true,
      openidBound: true,
      revokedStaleAdmins: revokedStaleAdmins.filter(Boolean),
    }, "首个管理员已创建，请返回小程序刷新管理员状态");
  } catch (error) {
    console.error("[bootstrapAdmin] failed", {
      message: error && error.message,
      stack: error && error.stack,
    });
    return fail("首个管理员创建失败，请查看云函数日志", 500);
  }
};
