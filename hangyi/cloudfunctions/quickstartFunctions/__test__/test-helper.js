/**
 * test-helper.js - 单元测试的 mock 桩
 *
 * 在 node --test 跑测试时, 用 Module._cache 替换 wx-server-sdk 的 require
 * 让 utils.js / router/* 的顶层 cloud.init / cloud.database() 不会真连云
 *
 * 用法:
 *   node --import ./__test__/register-mock.js --test __test__/*.test.js
 *   或:
 *   node -r ./__test__/register-mock.js --test __test__/*.test.js   (Node 18+)
 */
const path = require("path");
const Module = require("module");

// 构造一个可配置的 mock cloud
function buildCloud(mockState) {
  return {
    DYNAMIC_CURRENT_ENV: "__DYNAMIC__",
    init: () => {},
    updateConfig: () => {},
    registerService: () => {},
    uploadFile: async ({ cloudPath, fileContent }) => ({
      fileID: `cloud://mock/${cloudPath}`,
      status: 0,
    }),
    getWXContext: () => ({
      OPENID: mockState.openid,
      APPID: "wx-test-appid",
      UNIONID: "unionid-test",
      SOURCE: mockState.source,
    }),
    openapi: {
      phonenumber: {
        getPhoneNumber: async ({ code }) => {
          const phoneInfo = mockState.phoneByCode[code];
          if (!phoneInfo) throw new Error(`未知 phone code: ${code}`);
          return { phoneInfo };
        },
      },
    },
    database: () => buildDB(mockState),
  };
}

function buildDB(mockState) {
  // 与真实 WeChat 云 SDK 一致: 命令构造接受单值参数, 存到 b
  // 例如: _.gte(4) => { type: "gte", b: 4 }
  const _command = {
    eq: (b) => ({ type: "eq", b }),
    neq: (b) => ({ type: "neq", b }),
    in: (b) => ({ type: "in", b }),
    and: (...args) => ({ type: "and", args }),
    or: (...args) => ({ type: "or", args }),
    gt: (b) => ({ type: "gt", b }),
    gte: (b) => ({ type: "gte", b }),
    lt: (b) => ({ type: "lt", b }),
    lte: (b) => ({ type: "lte", b }),
    exists: (b) => ({ type: "exists", b }),
  };
  return {
    command: _command,
    collection: (name) => buildCollection(name, mockState),
  };
}

function buildCollection(name, mockState) {
  // 匹配 where 子句: 处理 { field: value }, { field: _.eq(value) }, { isTestAdmin: _.neq(true) }, { field: _.in([..]) }
  // 同时支持 { field: _.gte(date) } 形式 (范围下限, 不区分 eq/lt/lte, 仅要求 doc[k] >= v.b)
  function match(doc, where) {
    if (!where) return true;
    for (const [k, v] of Object.entries(where)) {
      if (v && typeof v === "object" && v.type) {
        if (v.type === "eq" && doc[k] !== v.b) return false;
        if (v.type === "neq" && doc[k] === v.b) return false;
        if (v.type === "in") {
          if (!v.b || !Array.isArray(v.b) || !v.b.includes(doc[k])) return false;
        }
        if (v.type === "gte") {
          // 大于等于: 不区分 lt/lte/gt/gte, 都按范围下限处理
          if (v.b == null || doc[k] == null) return false;
          if (doc[k] < v.b) return false;
        }
        if (v.type === "lte") {
          if (v.b == null || doc[k] == null) return false;
          if (doc[k] > v.b) return false;
        }
        if (v.type === "and") {
          if (!v.args.every(arg => match(doc, arg))) return false;
        }
        if (v.type === "or") {
          if (!v.args.some(arg => match(doc, arg))) return false;
        }
        if (v.type === "gt") {
          if (v.b == null || doc[k] == null) return false;
          if (!(doc[k] > v.b)) return false;
        }
        if (v.type === "lt") {
          if (v.b == null || doc[k] == null) return false;
          if (!(doc[k] < v.b)) return false;
        }
        if (v.type === "exists") {
          // exists(false) 字段不存在, exists(true) 字段存在
          const has = doc[k] !== undefined && doc[k] !== null;
          if (v.b === true && !has) return false;
          if (v.b === false && has) return false;
        }
      } else {
        if (doc[k] !== v) return false;
      }
    }
    return true;
  }

  return {
    _name: name,
    _state: mockState,
    where(where) {
      this._where = where;
      return this;
    },
    limit(n) {
      this._limit = n;
      return this;
    },
    skip(n) {
      this._skip = n;
      return this;
    },
    orderBy(field, direction) {
      this._orderBy = { field, direction };
      return this;
    },
    field(...fields) {
      // 兼容两种调用形式:
      //   .field("name", "age") - 多字符串参数
      //   .field({ name: 1, age: 1 }) - 单对象参数 (取 key)
      let proj = [];
      if (fields.length === 1 && typeof fields[0] === "object" && !Array.isArray(fields[0])) {
        proj = Object.keys(fields[0]);
      } else {
        proj = fields.flat();
      }
      this._projection = proj;
      return this;
    },
    async get() {
      let all = (mockState.collections[name] || []).slice();
      let filtered = this._where ? all.filter((d) => match(d, this._where)) : all;
      // 按 _orderBy 排序
      if (this._orderBy) {
        const { field, direction } = this._orderBy;
        const dir = direction === "desc" ? -1 : 1;
        filtered = filtered.slice().sort((a, b) => {
          const av = a[field], bv = b[field];
          if (av == null && bv == null) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          if (av < bv) return -1 * dir;
          if (av > bv) return 1 * dir;
          return 0;
        });
      }
      // 按 _projection 字段过滤
      if (this._projection) {
        filtered = filtered.map(d => {
          const o = {};
          for (const f of this._projection) if (f in d) o[f] = d[f];
          o._id = d._id;
          return o;
        });
      }
      const start = this._skip || 0;
      const end = this._limit ? start + this._limit : filtered.length;
      return { data: filtered.slice(start, end) };
    },
    async count() {
      const all = (mockState.collections[name] || []).slice();
      const filtered = this._where ? all.filter((d) => match(d, this._where)) : all;
      return { total: filtered.length };
    },
    async update({ data }) {
      const arr = mockState.collections[name] || [];
      const matched = this._where ? arr.filter((d) => match(d, this._where)) : arr;
      matched.forEach((doc) => {
        const idx = arr.findIndex((item) => item._id === doc._id);
        if (idx < 0) return;
        arr[idx] = { ...arr[idx], ...data };
        mockState.updates.push({ collection: name, id: doc._id, data });
      });
      return { stats: { updated: matched.length } };
    },
    doc(id) {
      return {
        async update({ data }) {
          const arr = mockState.collections[name] || [];
          const idx = arr.findIndex((d) => d._id === id);
          if (idx >= 0) {
            // 支持嵌套字段 (a.b.c 形式)
            const merged = { ...arr[idx] };
            for (const [k, v] of Object.entries(data)) {
              if (k.includes(".")) {
                const parts = k.split(".");
                let cur = merged;
                for (let i = 0; i < parts.length - 1; i++) {
                  if (typeof cur[parts[i]] !== "object" || cur[parts[i]] === null) cur[parts[i]] = {};
                  cur = cur[parts[i]];
                }
                cur[parts[parts.length - 1]] = v;
              } else {
                merged[k] = v;
              }
            }
            arr[idx] = merged;
            mockState.updates.push({ collection: name, id, data });
          }
        },
        async remove() {
          const arr = mockState.collections[name] || [];
          const idx = arr.findIndex((d) => d._id === id);
          if (idx >= 0) arr.splice(idx, 1);
        },
        async set({ data }) {
          // 集合不存在时必须先初始化, 否则 push 到临时数组导致数据丢失。
          if (!mockState.collections[name]) mockState.collections[name] = [];
          const arr = mockState.collections[name];
          const idx = arr.findIndex((d) => d._id === id);
          if (idx >= 0) arr[idx] = { ...arr[idx], ...data };
          else arr.push({ _id: id, ...data });
        },
        async get() {
          // 与真实云 SDK 一致: doc().get() 返回单数对象, 不是数组
          const arr = mockState.collections[name] || [];
          const d = arr.find((x) => x._id === id);
          return { data: d || null };
        },
      };
    },
    async add({ data }) {
      const id = `mock-${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      (mockState.collections[name] = mockState.collections[name] || []).push({ _id: id, ...data });
      return { _id: id };
    },
  };
}

// ── 核心: 把 wx-server-sdk / wx-js-utils 替换成上面的 buildCloud ──
const realResolve = Module._resolveFilename;
const realLoad = Module._load;

Module._load = function (request, parent, isMain) {
  if (request === "wx-server-sdk") {
    const shared = global.__HANGYI_MOCK_STATE__ || (global.__HANGYI_MOCK_STATE__ = makeFreshState());
    return buildCloud(shared);
  }
  if (request === "@cloudbase/node-sdk") {
    const shared = global.__HANGYI_MOCK_STATE__ || (global.__HANGYI_MOCK_STATE__ = makeFreshState());
    return {
      getCloudbaseContext: (context = {}) => context.__mockCloudbaseContext || ({
        TCB_SOURCE: shared.source,
        WX_OPENID: shared.openid,
      }),
    };
  }
  if (request === "qrcode") {
    return { toDataURL: async () => "data:image/png;base64,STUB" };
  }
  if (request === "node-xlsx") {
    return { build: () => Buffer.from("") };
  }
  return realLoad.call(this, request, parent, isMain);
};

function makeFreshState() {
  return {
    openid: "test-openid-default",
    source: "wx_client",
    collections: {},
    updates: [],
    phoneByCode: {},
  };
}

global.resetMockState = (opts = {}) => {
  const fresh = makeFreshState();
  if (Object.prototype.hasOwnProperty.call(opts, "openid")) fresh.openid = opts.openid;
  if (Object.prototype.hasOwnProperty.call(opts, "source")) fresh.source = opts.source;
  if (global.__HANGYI_MOCK_STATE__) {
    Object.assign(global.__HANGYI_MOCK_STATE__, fresh);
  } else {
    global.__HANGYI_MOCK_STATE__ = fresh;
  }
  // 清理 assistant HTTP mock,防断言失败后泄漏污染后续用例(审查 F1,比逐处 try/finally 更可靠)
  delete global.__HANGYI_ASSISTANT_HTTP_REQUEST__;
  return global.__HANGYI_MOCK_STATE__;
};
