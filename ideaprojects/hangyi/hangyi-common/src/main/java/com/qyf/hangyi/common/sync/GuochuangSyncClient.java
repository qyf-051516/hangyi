package com.qyf.hangyi.common.sync;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.*;
import java.util.concurrent.ConcurrentLinkedQueue;

/**
 * 国创赛同步客户端（轮询模式）。
 * 每 60 秒从国创赛拉取变更数据写入本地，同时将本地变更推送到国创赛。
 * 推送通过内存队列暂存，由 SyncPollingService 定时消费。
 */
@Component
public class GuochuangSyncClient {

    private static final Logger log = LoggerFactory.getLogger(GuochuangSyncClient.class);
    private static final ParameterizedTypeReference<Map<String, Object>> MAP_TYPE =
        new ParameterizedTypeReference<>() {};

    private final RestTemplate rest = new RestTemplate();

    /** 待推送队列，SyncPollingService 定时消费 */
    public final ConcurrentLinkedQueue<PushEntry> pushQueue = new ConcurrentLinkedQueue<>();

    @Value("${guochuang.sync.enabled:false}")
    private boolean enabled;

    @Value("${guochuang.sync.url:}")
    private String baseUrl;

    @Value("${guochuang.sync.api-key:}")
    private String apiKey;

    /** Controller 写操作后调用，将变更放入推送队列（fire-and-forget） */
    public void enqueuePush(String collection, Map<String, Object> record) {
        if (!enabled || baseUrl.isBlank()) {
            return;
        }
        pushQueue.add(new PushEntry(collection, record));
    }

    /** 拉取国创赛某个集合自 since 时间以来的变更 */
    public List<Map<String, Object>> pullChanges(String collection, Date since) {
        if (!enabled || baseUrl.isBlank()) return List.of();
        String url = baseUrl + "/sync/changes?collection=" + collection + "&since=" + since.getTime();
        HttpHeaders headers = new HttpHeaders();
        headers.set("X-Internal-API-Key", apiKey);
        try {
            ResponseEntity<Map<String, Object>> resp = rest.exchange(
                    url, HttpMethod.GET, new HttpEntity<>(headers), MAP_TYPE);
            if (resp.getBody() != null && resp.getBody().get("data") instanceof List) {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> data = (List<Map<String, Object>>) resp.getBody().get("data");
                return data;
            }
            throw new IllegalStateException("同步拉取响应缺少 data");
        } catch (Exception exception) {
            throw new IllegalStateException("同步拉取失败: " + collection, exception);
        }
    }

    /** 将本地变更推送到国创赛 */
    public void pushChanges(String collection, List<Map<String, Object>> records) {
        if (!enabled || baseUrl.isBlank() || records.isEmpty()) return;
        String url = baseUrl + "/sync/push";
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("X-Internal-API-Key", apiKey);
        Map<String, Object> body = Map.of("collection", collection, "records", records);
        try {
            rest.postForEntity(url, new HttpEntity<>(body, headers), String.class);
            log.debug("Push ok: {} ({} records)", collection, records.size());
        } catch (Exception exception) {
            throw new IllegalStateException("同步推送失败: " + collection, exception);
        }
    }

    /** 推送队列条目 */
    public record PushEntry(String collection, Map<String, Object> record) {}
}
