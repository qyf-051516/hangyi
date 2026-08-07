package com.qyf.hangyi.assistant.knowledge;

import com.qyf.hangyi.assistant.config.AssistantProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Component
public class KnowledgeIngestionRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(KnowledgeIngestionRunner.class);

    private final AssistantProperties properties;
    private final KnowledgeIngestionService ingestionService;
    private final KnowledgeEvaluationService evaluationService;

    public KnowledgeIngestionRunner(
            AssistantProperties properties,
            KnowledgeIngestionService ingestionService,
            KnowledgeEvaluationService evaluationService
    ) {
        this.properties = properties;
        this.ingestionService = ingestionService;
        this.evaluationService = evaluationService;
    }

    @Override
    public void run(ApplicationArguments args) {
        String mode = properties.getIngestionMode();
        if (mode != null && !mode.isBlank() && !"off".equalsIgnoreCase(mode)) {
            IngestionReport report = ingestionService.run(mode);
            log.info(
                    "知识入库完成: mode={}, scanned={}, changed={}, unchanged={}, removed={}, chunks={}",
                    report.mode(),
                    report.scannedDocuments(),
                    report.changedDocuments(),
                    report.unchangedDocuments(),
                    report.removedDocuments(),
                    report.indexedChunks()
            );
        }
        if (properties.isEvaluationEnabled()) {
            EvaluationReport report = evaluationService.evaluate();
            log.info(
                    "知识检索评测完成: total={}, hits={}, recallAt5={}, missed={}",
                    report.total(),
                    report.hits(),
                    report.recallAt5(),
                    report.missedQuestionIds()
            );
            if (report.recallAt5() < properties.getMinRecallAt5()) {
                throw new IllegalStateException(
                        "知识检索 Recall@5 未达到门槛: "
                                + report.recallAt5()
                                + " < "
                                + properties.getMinRecallAt5()
                );
            }
        }
    }
}
