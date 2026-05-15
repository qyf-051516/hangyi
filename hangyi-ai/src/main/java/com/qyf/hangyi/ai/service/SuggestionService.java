package com.qyf.hangyi.ai.service;

import com.qyf.hangyi.ai.client.EmployeeFeignClient;
import com.qyf.hangyi.ai.client.FlightFeignClient;
import com.qyf.hangyi.ai.client.PreferenceFeignClient;
import com.qyf.hangyi.ai.client.ScheduleFeignClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class SuggestionService {

    private static final Logger log = LoggerFactory.getLogger(SuggestionService.class);
    private static final int MAX_DATA_ROWS = 20;

    private final ChatClient chatClient;

    @Autowired
    private EmployeeFeignClient employeeFeignClient;
    @Autowired
    private ScheduleFeignClient scheduleFeignClient;
    @Autowired
    private FlightFeignClient flightFeignClient;
    @Autowired
    private PreferenceFeignClient preferenceFeignClient;

    public SuggestionService(ChatClient.Builder builder) {
        this.chatClient = builder.build();
    }

    public Map<String, Object> getSuggestions(Map<String, Object> request) {
        try {
            // 1. Fetch real data from services
            String employeeData = fetchEmployeeData();
            String scheduleData = fetchScheduleData(request);
            String preferenceData = fetchPreferenceData();

            // 2. Build structured prompt with real data
            String prompt = buildSuggestionPrompt(employeeData, scheduleData, preferenceData);

            // 3. Call Spring AI ChatClient
            String aiResponse = chatClient.prompt()
                    .user(u -> u.text(prompt))
                    .call()
                    .content();

            // 4. Parse structured response into items
            List<Map<String, Object>> suggestions = parseSuggestions(aiResponse);

            Map<String, Object> result = new HashMap<>();
            result.put("suggestions", suggestions);
            result.put("raw", aiResponse);
            result.put("model", "ollama/qwen2.5");
            result.put("dataSummary", Map.of(
                    "employeeCount", extractCount(employeeData, "员工"),
                    "scheduleCount", extractCount(scheduleData, "排班"),
                    "preferenceCount", extractCount(preferenceData, "偏好")
            ));
            return result;
        } catch (Exception e) {
            log.warn("AI service unavailable, returning data-driven fallback", e);
            return dataDrivenFallback(request);
        }
    }

    public Map<String, Object> query(String naturalLanguageQuery) {
        try {
            String employeeData = fetchEmployeeData();
            String scheduleData = fetchScheduleData(Map.of());
            String flightData = fetchFlightData();

            String prompt = "你是一个机场机务排班系统的中文数据助手。以下是系统中当前的真实数据：\n\n"
                    + "【人员数据】\n" + employeeData + "\n\n"
                    + "【排班数据】\n" + scheduleData + "\n\n"
                    + "【航班数据】\n" + flightData + "\n\n"
                    + "用户的问题是：" + naturalLanguageQuery + "\n\n"
                    + "请基于上述真实数据回答用户问题。如果数据不足以回答，请说明已有数据范围并给出合理建议。"
                    + "使用中文回答，保持简洁专业。";

            String response = chatClient.prompt()
                    .user(u -> u.text(prompt))
                    .call()
                    .content();

            Map<String, Object> result = new HashMap<>();
            result.put("answer", response);
            return result;
        } catch (Exception e) {
            log.warn("AI query unavailable", e);
            Map<String, Object> result = new HashMap<>();
            result.put("answer", "AI服务暂不可用（Ollama未就绪）。\n"
                    + "但系统已加载以下数据可供查看：\n"
                    + fetchEmployeeDataSummary() + "\n"
                    + fetchScheduleSummary() + "\n"
                    + "请直接通过页面菜单查看具体数据。");
            return result;
        }
    }

    public Map<String, Object> detectConflicts(Map<String, Object> request) {
        try {
            String employeeData = fetchEmployeeData();
            String scheduleData = fetchScheduleData(request);
            String preferenceData = fetchPreferenceData();

            String prompt = "你是一个机场机务排班冲突检测专家。以下是从系统获取的真实数据：\n\n"
                    + "【人员数据】\n" + employeeData + "\n\n"
                    + "【排班数据】\n" + scheduleData + "\n\n"
                    + "【员工偏好】\n" + preferenceData + "\n\n"
                    + "请严格检测以下冲突类型（基于上述真实数据）：\n"
                    + "1. 连续夜班违规（同一人连续2天以上夜班）\n"
                    + "2. 夜班转早班违规（夜班次日排早班间隔不足12小时）\n"
                    + "3. 休息天数不足（同一人7天内休息少于2天）\n"
                    + "4. 资质冲突（人员资质与排班岗位要求不匹配）\n"
                    + "5. 偏好冲突（排班与员工登记偏好不符）\n\n"
                    + "对于每条冲突，输出格式：\n"
                    + "[严重程度:高/中/低] 员工姓名 - 冲突描述 - 建议处理方式\n\n"
                    + "如果无冲突，输出: 未检测到排班冲突";

            String aiResponse = chatClient.prompt()
                    .user(u -> u.text(prompt))
                    .call()
                    .content();

            List<Map<String, Object>> conflicts = parseConflicts(aiResponse);

            Map<String, Object> result = new HashMap<>();
            result.put("conflicts", conflicts);
            result.put("raw", aiResponse);
            result.put("totalCount", conflicts.size());
            return result;
        } catch (Exception e) {
            log.warn("Conflict detection AI unavailable", e);
            Map<String, Object> result = new HashMap<>();
            result.put("conflicts", List.of());
            result.put("totalCount", 0);
            result.put("message", "AI冲突检测服务暂不可用，请稍后再试");
            return result;
        }
    }

    // ========== Data Fetching ==========

    private String fetchEmployeeData() {
        try {
            var resp = employeeFeignClient.listAll();
            if (resp.getCode() == 200 && resp.getData() != null) {
                List<Map<String, Object>> list = resp.getData();
                return list.stream()
                        .limit(MAX_DATA_ROWS)
                        .map(e -> String.format("  ID=%s, 姓名=%s, 岗位=%s, 工种=%s, 组ID=%s",
                                e.get("id"), e.get("name"), e.get("position"),
                                e.get("workType"), e.get("groupId")))
                        .collect(Collectors.joining("\n"));
            }
        } catch (Exception e) {
            log.debug("Failed to fetch employees", e);
        }
        return "暂无人员数据";
    }

    private String fetchEmployeeDataSummary() {
        try {
            var resp = employeeFeignClient.listAll();
            if (resp.getCode() == 200 && resp.getData() != null) {
                return "  - 共 " + resp.getData().size() + " 名员工";
            }
        } catch (Exception e) {
            log.debug("Failed to fetch employee summary", e);
        }
        return "  - 员工数据暂不可用";
    }

    private String fetchScheduleData(Map<String, Object> request) {
        try {
            Long groupId = request != null && request.get("groupId") != null
                    ? Long.valueOf(request.get("groupId").toString()) : null;
            var resp = scheduleFeignClient.page(1, 50, groupId, null);
            if (resp.getCode() == 200 && resp.getData() != null) {
                // Page returns a map with "records" key
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> records = (List<Map<String, Object>>) resp.getData().get("records");
                if (records != null) {
                    return records.stream()
                            .limit(MAX_DATA_ROWS)
                            .map(s -> String.format("  排班ID=%s, 名称=%s, 开始=%s, 结束=%s, 状态=%s",
                                    s.get("id"), s.get("scheduleName"),
                                    s.get("startDate"), s.get("endDate"), s.get("status")))
                            .collect(Collectors.joining("\n"));
                }
            }
        } catch (Exception e) {
            log.debug("Failed to fetch schedules", e);
        }
        return "暂无排班数据";
    }

    private String fetchScheduleSummary() {
        try {
            var resp = scheduleFeignClient.page(1, 10, null, null);
            if (resp.getCode() == 200 && resp.getData() != null) {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> records = (List<Map<String, Object>>) resp.getData().get("records");
                if (records != null) {
                    return "  - 共 " + records.size() + " 条排班记录";
                }
            }
        } catch (Exception e) {
            log.debug("Failed to fetch schedule summary", e);
        }
        return "  - 排班数据暂不可用";
    }

    private String fetchFlightData() {
        try {
            var resp = flightFeignClient.page(1, 20, null, null);
            if (resp.getCode() == 200 && resp.getData() != null) {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> records = (List<Map<String, Object>>) resp.getData().get("records");
                if (records != null) {
                    return records.stream()
                            .limit(MAX_DATA_ROWS)
                            .map(f -> String.format("  航班ID=%s, 航班号=%s, 日期=%s, 时间=%s, 起降=%s/%s",
                                    f.get("id"), f.get("flightNo"), f.get("planDate"),
                                    f.get("planTime"), f.get("routeFrom"), f.get("routeTo")))
                            .collect(Collectors.joining("\n"));
                }
            }
        } catch (Exception e) {
            log.debug("Failed to fetch flights", e);
        }
        return "暂无航班数据";
    }

    private String fetchPreferenceData() {
        try {
            var empResp = employeeFeignClient.listAll();
            if (empResp.getCode() == 200 && empResp.getData() != null) {
                StringBuilder sb = new StringBuilder();
                int count = 0;
                for (Map<String, Object> emp : empResp.getData()) {
                    if (count >= 10) break;
                    Object empId = emp.get("id");
                    if (empId == null) continue;
                    try {
                        var prefResp = preferenceFeignClient.listByEmployee(Long.valueOf(empId.toString()));
                        if (prefResp.getCode() == 200 && prefResp.getData() != null && !prefResp.getData().isEmpty()) {
                            String prefs = prefResp.getData().stream()
                                    .map(p -> String.format("%s=%s", p.get("prefKey"), p.get("prefValue")))
                                    .collect(Collectors.joining(","));
                            sb.append("  员工").append(emp.get("name")).append("(").append(empId).append("): ").append(prefs).append("\n");
                            count++;
                        }
                    } catch (Exception ignored) {
                    }
                }
                if (sb.length() > 0) return sb.toString();
            }
        } catch (Exception e) {
            log.debug("Failed to fetch preferences", e);
        }
        return "暂无偏好数据";
    }

    // ========== Prompt Building ==========

    private String buildSuggestionPrompt(String employeeData, String scheduleData, String preferenceData) {
        return "你是一个机场机务排班专家。以下是从系统获取的真实数据：\n\n"
                + "【人员数据】\n" + employeeData + "\n\n"
                + "【排班数据】\n" + scheduleData + "\n\n"
                + "【员工偏好】\n" + preferenceData + "\n\n"
                + "约束条件：\n"
                + "1. 不能连续两个夜班（夜班后须接白班或休息）\n"
                + "2. 夜班后不能接早班（间隔至少12小时）\n"
                + "3. 每人每周至少休息2天\n"
                + "4. 每人每周总工时不超过40小时\n"
                + "5. 周末班次尽量均分\n"
                + "6. 尽量满足员工排班偏好\n\n"
                + "请基于上述真实数据分析当前排班可能存在的问题，给出优化建议。\n"
                + "输出格式（每条建议一行，用|分隔字段）：\n"
                + "严重程度:高/中/低 | 问题描述 | 建议方案\n"
                + "最多输出5条。";
    }

    // ========== Result Parsing ==========

    private List<Map<String, Object>> parseSuggestions(String aiResponse) {
        List<Map<String, Object>> list = new ArrayList<>();
        if (aiResponse == null || aiResponse.isBlank()) return list;

        String[] lines = aiResponse.split("\n");
        for (String line : lines) {
            line = line.trim();
            if (line.isEmpty() || line.startsWith("```") || line.startsWith("输出")) continue;
            // Try to parse "严重程度:X | 问题 | 建议" format
            if (line.contains("|")) {
                String[] parts = line.split("\\|");
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("severity", parts.length > 0 ? parts[0].replace("严重程度:", "").trim() : "中");
                item.put("issue", parts.length > 1 ? parts[1].trim() : "");
                item.put("suggestion", parts.length > 2 ? parts[2].trim() : "");
                list.add(item);
            } else {
                // Raw line as text
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("severity", "信息");
                item.put("issue", line);
                item.put("suggestion", "");
                list.add(item);
            }
        }
        return list;
    }

    private List<Map<String, Object>> parseConflicts(String aiResponse) {
        List<Map<String, Object>> list = new ArrayList<>();
        if (aiResponse == null || aiResponse.isBlank()) return list;

        String[] lines = aiResponse.split("\n");
        for (String line : lines) {
            line = line.trim();
            if (line.isEmpty() || line.startsWith("```") || line.startsWith("未检测到")) continue;
            if (line.startsWith("[")) {
                // Parse "[严重程度:高/中/低] 员工姓名 - 描述 - 建议"
                Map<String, Object> item = new LinkedHashMap<>();
                int endBracket = line.indexOf(']');
                if (endBracket > 0) {
                    item.put("severity", line.substring(1, endBracket).replace("严重程度:", "").trim());
                    String rest = line.substring(endBracket + 1).trim();
                    String[] parts = rest.split(" - ");
                    item.put("employee", parts.length > 0 ? parts[0].trim() : "");
                    item.put("description", parts.length > 1 ? parts[1].trim() : "");
                    item.put("suggestion", parts.length > 2 ? parts[2].trim() : "");
                } else {
                    item.put("severity", "中");
                    item.put("description", line);
                }
                list.add(item);
            } else {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("severity", "信息");
                item.put("description", line);
                list.add(item);
            }
        }
        return list;
    }

    private int extractCount(String data, String label) {
        if (data == null || data.isEmpty() || data.contains("暂无")) return 0;
        return (int) data.lines().filter(l -> l.contains(label)).count();
    }

    private Map<String, Object> dataDrivenFallback(Map<String, Object> request) {
        Map<String, Object> result = new HashMap<>();
        List<Map<String, Object>> suggestions = new ArrayList<>();

        try {
            String summary = fetchEmployeeDataSummary();
            suggestions.add(Map.of(
                    "severity", "信息",
                    "issue", "AI优化建议暂不可用（Ollama未就绪）",
                    "suggestion", "请安装Ollama并执行: ollama pull qwen2.5:7b"
            ));
            suggestions.add(Map.of(
                    "severity", "信息",
                    "issue", "当前系统状态",
                    "suggestion", summary + " | " + fetchScheduleSummary()
            ));
        } catch (Exception e) {
            suggestions.add(Map.of(
                    "severity", "信息",
                    "issue", "系统数据加载中",
                    "suggestion", "请确认各服务正常运行"
            ));
        }

        result.put("suggestions", suggestions);
        result.put("model", "fallback");
        return result;
    }
}
