package com.qyf.hangyi.assistant.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.nio.file.Path;
import java.time.Duration;

@ConfigurationProperties(prefix = "assistant")
public class AssistantProperties {

    private boolean engineEnabled;
    private boolean dependencyProbeEnabled;
    private String internalApiKey = "";
    private String qdrantUrl = "http://localhost:6333";
    private String qdrantApiKey = "";
    private String qdrantCollection = "hangyi_business_knowledge";
    private String ollamaUrl = "http://localhost:11434";
    private String embeddingModel = "bge-m3";
    private int embeddingDimension = 1024;
    private String qwenBaseUrl = "https://dashscope.aliyuncs.com/compatible-mode/v1";
    private String qwenApiKey = "";
    private String qwenChatModel = "qwen-plus";
    private Duration connectTimeout = Duration.ofSeconds(3);
    private Duration readTimeout = Duration.ofSeconds(25);
    private Duration requestTimeout = Duration.ofSeconds(18);
    private int topK = 5;
    private double scoreThreshold = 0.48;
    private int maxContextChars = 12000;
    private int maxAnswerTokens = 900;
    private int employeeDailyQuota = 20;
    private int adminDailyQuota = 100;
    private int employeeMinuteLimit = 10;
    private int adminMinuteLimit = 30;
    private Duration rateLimitWindow = Duration.ofMinutes(1);
    private Duration internalSignatureMaxAge = Duration.ofSeconds(60);
    private Path knowledgePath = Path.of("knowledge", "business");
    private String ingestionMode = "off";
    private boolean confirmFullRebuild;
    private boolean evaluationEnabled;
    private Path evaluationPath = Path.of("knowledge", "evaluation", "questions.json");
    private double minRecallAt5 = 0.85;

    public Duration getRequestTimeout() {
        return requestTimeout;
    }

    public void setRequestTimeout(Duration requestTimeout) {
        this.requestTimeout = requestTimeout;
    }

    public boolean isEngineEnabled() {
        return engineEnabled;
    }

    public void setEngineEnabled(boolean engineEnabled) {
        this.engineEnabled = engineEnabled;
    }

    public boolean isDependencyProbeEnabled() {
        return dependencyProbeEnabled;
    }

    public void setDependencyProbeEnabled(boolean dependencyProbeEnabled) {
        this.dependencyProbeEnabled = dependencyProbeEnabled;
    }

    public String getInternalApiKey() {
        return internalApiKey;
    }

    public void setInternalApiKey(String internalApiKey) {
        this.internalApiKey = internalApiKey;
    }

    public String getQdrantUrl() {
        return qdrantUrl;
    }

    public void setQdrantUrl(String qdrantUrl) {
        this.qdrantUrl = qdrantUrl;
    }

    public String getQdrantApiKey() {
        return qdrantApiKey;
    }

    public void setQdrantApiKey(String qdrantApiKey) {
        this.qdrantApiKey = qdrantApiKey;
    }

    public String getQdrantCollection() {
        return qdrantCollection;
    }

    public void setQdrantCollection(String qdrantCollection) {
        this.qdrantCollection = qdrantCollection;
    }

    public String getOllamaUrl() {
        return ollamaUrl;
    }

    public void setOllamaUrl(String ollamaUrl) {
        this.ollamaUrl = ollamaUrl;
    }

    public String getEmbeddingModel() {
        return embeddingModel;
    }

    public void setEmbeddingModel(String embeddingModel) {
        this.embeddingModel = embeddingModel;
    }

    public int getEmbeddingDimension() {
        return embeddingDimension;
    }

    public void setEmbeddingDimension(int embeddingDimension) {
        this.embeddingDimension = embeddingDimension;
    }

    public String getQwenBaseUrl() {
        return qwenBaseUrl;
    }

    public void setQwenBaseUrl(String qwenBaseUrl) {
        this.qwenBaseUrl = qwenBaseUrl;
    }

    public String getQwenApiKey() {
        return qwenApiKey;
    }

    public void setQwenApiKey(String qwenApiKey) {
        this.qwenApiKey = qwenApiKey;
    }

    public String getQwenChatModel() {
        return qwenChatModel;
    }

    public void setQwenChatModel(String qwenChatModel) {
        this.qwenChatModel = qwenChatModel;
    }

    public Duration getConnectTimeout() {
        return connectTimeout;
    }

    public void setConnectTimeout(Duration connectTimeout) {
        this.connectTimeout = connectTimeout;
    }

    public Duration getReadTimeout() {
        return readTimeout;
    }

    public void setReadTimeout(Duration readTimeout) {
        this.readTimeout = readTimeout;
    }

    public int getTopK() {
        return topK;
    }

    public void setTopK(int topK) {
        this.topK = topK;
    }

    public double getScoreThreshold() {
        return scoreThreshold;
    }

    public void setScoreThreshold(double scoreThreshold) {
        this.scoreThreshold = scoreThreshold;
    }

    public int getMaxContextChars() {
        return maxContextChars;
    }

    public void setMaxContextChars(int maxContextChars) {
        this.maxContextChars = maxContextChars;
    }

    public int getMaxAnswerTokens() {
        return maxAnswerTokens;
    }

    public void setMaxAnswerTokens(int maxAnswerTokens) {
        this.maxAnswerTokens = maxAnswerTokens;
    }

    public int getEmployeeDailyQuota() {
        return employeeDailyQuota;
    }

    public void setEmployeeDailyQuota(int employeeDailyQuota) {
        this.employeeDailyQuota = employeeDailyQuota;
    }

    public int getAdminDailyQuota() {
        return adminDailyQuota;
    }

    public void setAdminDailyQuota(int adminDailyQuota) {
        this.adminDailyQuota = adminDailyQuota;
    }

    public int getEmployeeMinuteLimit() {
        return employeeMinuteLimit;
    }

    public void setEmployeeMinuteLimit(int employeeMinuteLimit) {
        this.employeeMinuteLimit = employeeMinuteLimit;
    }

    public int getAdminMinuteLimit() {
        return adminMinuteLimit;
    }

    public void setAdminMinuteLimit(int adminMinuteLimit) {
        this.adminMinuteLimit = adminMinuteLimit;
    }

    public Duration getRateLimitWindow() {
        return rateLimitWindow;
    }

    public void setRateLimitWindow(Duration rateLimitWindow) {
        this.rateLimitWindow = rateLimitWindow;
    }

    public Duration getInternalSignatureMaxAge() {
        return internalSignatureMaxAge;
    }

    public void setInternalSignatureMaxAge(Duration internalSignatureMaxAge) {
        this.internalSignatureMaxAge = internalSignatureMaxAge;
    }

    public Path getKnowledgePath() {
        return knowledgePath;
    }

    public void setKnowledgePath(Path knowledgePath) {
        this.knowledgePath = knowledgePath;
    }

    public String getIngestionMode() {
        return ingestionMode;
    }

    public void setIngestionMode(String ingestionMode) {
        this.ingestionMode = ingestionMode;
    }

    public boolean isConfirmFullRebuild() {
        return confirmFullRebuild;
    }

    public void setConfirmFullRebuild(boolean confirmFullRebuild) {
        this.confirmFullRebuild = confirmFullRebuild;
    }

    public boolean isEvaluationEnabled() {
        return evaluationEnabled;
    }

    public void setEvaluationEnabled(boolean evaluationEnabled) {
        this.evaluationEnabled = evaluationEnabled;
    }

    public Path getEvaluationPath() {
        return evaluationPath;
    }

    public void setEvaluationPath(Path evaluationPath) {
        this.evaluationPath = evaluationPath;
    }

    public double getMinRecallAt5() {
        return minRecallAt5;
    }

    public void setMinRecallAt5(double minRecallAt5) {
        this.minRecallAt5 = minRecallAt5;
    }
}
