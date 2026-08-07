package com.qyf.hangyi.assistant.knowledge;

public record IngestionReport(
        String mode,
        int scannedDocuments,
        int changedDocuments,
        int unchangedDocuments,
        int removedDocuments,
        int indexedChunks
) {
}
