const test = require("node:test");
const assert = require("node:assert/strict");
const { buildLocalAnswer } = require("../router/assistant-local");

const CASES = [
  ["普通员工能自己修改班组和机型资质吗？", "role-employee-fields", false],
  ["系统第一次怎么开通管理员？", "role-first-admin", false],
  ["管理员工作台能处理哪些事情？", "role-admin-capability", true],
  ["小程序调用智能助手时身份从哪里来？", "role-identity-trust", false],
  ["系统有哪些常用班次？", "schedule-shifts", false],
  ["自动排班会检查哪些硬性冲突？", "schedule-hard-rules", false],
  ["系统默认单日最大工时是多少？", "schedule-default-hours", false],
  ["管理员编辑排班后应该怎样发布？", "schedule-publish", true],
  ["勤务与放行排班为什么要先生成预览？", "schedule-service-preview", true],
  ["未来排班可以提前点完成吗？", "schedule-complete", false],
  ["调班申请的 SWAP 和 SHIFT_APPLY 有什么区别？", "swap-types", false],
  ["调班理由可以只上传图片不写文字吗？", "swap-evidence", false],
  ["提交调班时系统自动校验什么？", "swap-validation", false],
  ["已经审批通过的调班还能撤回吗？", "swap-withdraw", false],
  ["管理员批准调班前为什么还要再校验一次？", "swap-approval-recheck", true],
  ["请假原因支持图片吗？", "leave-evidence", false],
  ["请假批准以后原来的排班怎么处理？", "leave-impact", false],
  ["什么条件下员工才算合格可用人员？", "qualification-available", false],
  ["资质快到期的红黄预警标准是什么？", "qualification-expiry", false],
  ["管理员修改员工机型资质后，未来排班会怎样？", "qualification-change", true],
  ["疲劳评分是不是医学判断？", "fatigue-scope", false],
  ["航班运行资料包含发动机型号和预计到达时间吗？", "flight-fields", false],
  ["预计到达时间能不能由管理员人工录入？", "flight-manual-eta", false],
  ["修改航班机型以后为什么要重新检查排班？", "flight-aircraft-change", false],
  ["实时航班状态有哪些？", "flight-realtime", false],
  ["知识助手能告诉我今天某航班的实时状态吗？", "flight-rag-limit", false],
  ["怎么生成可以打印的排班总表？", "export-print", false],
  ["要追查一次错误改派应该查看哪些记录？", "audit-sources", true],
  ["生产环境的演示数据开关应该怎么设置？", "audit-demo", true],
  ["助手密钥可以写在小程序代码里吗？", "audit-secrets", true],
];

test("assistant knowledge: 30 条客户演示业务题全部命中正确知识主题", () => {
  for (const [question, expectedId, isAdmin] of CASES) {
    const result = buildLocalAnswer({ question, isAdmin });
    assert.ok(result.answer.length >= 20, `回答过短: ${question}`);
    assert.equal(result.sources.length, 1, `缺少来源: ${question}`);
    assert.equal(result.sources[0].id, expectedId, `主题命中错误: ${question}`);
  }
});

test("assistant knowledge: 未知问题明确拒绝猜测", () => {
  const result = buildLocalAnswer({ question: "食堂今天有什么菜？", isAdmin: false });
  assert.equal(result.sources.length, 0);
  assert.match(result.answer, /不猜测/);
});

test("assistant knowledge: 普通员工不能命中管理员专属操作答案", () => {
  const result = buildLocalAnswer({ question: "如何追查一次错误改派？", isAdmin: false });
  assert.notEqual(result.sources[0] && result.sources[0].id, "audit-sources");
});
