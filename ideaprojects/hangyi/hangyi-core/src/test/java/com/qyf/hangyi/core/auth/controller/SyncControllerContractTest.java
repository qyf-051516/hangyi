package com.qyf.hangyi.core.auth.controller;

import com.qyf.hangyi.common.exception.BusinessException;
import com.qyf.hangyi.core.auth.service.SyncService;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.bind.annotation.PostMapping;

import java.util.ArrayList;
import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SyncControllerContractTest {

    @Test
    void leaveSyncAcceptsCanonicalAndLegacyPaths() throws Exception {
        Method method = SyncController.class.getDeclaredMethod(
            "syncLeaveRequests", java.util.List.class, jakarta.servlet.http.HttpServletRequest.class);
        PostMapping mapping = method.getAnnotation(PostMapping.class);

        assertThat(Arrays.asList(mapping.value()))
            .containsExactlyInAnyOrder("/leave-requests", "/leave_requests");
    }

    @Test
    void rejectsOversizedCollectionBeforeServiceInvocation() {
        SyncService syncService = mock(SyncService.class);
        SyncController controller = controller(syncService);
        List<Map<String, Object>> records = new ArrayList<>();
        for (int i = 0; i < 501; i++) records.add(Map.of("employeeNo", "GH" + i));

        assertThatThrownBy(() -> controller.syncStaff(records, requestWithKey()))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getCode())
                .isEqualTo(413);
        verify(syncService, never()).syncStaff(records);
    }

    @Test
    void batchDelegatesToSingleTransactionalServiceBoundary() {
        SyncService syncService = mock(SyncService.class);
        when(syncService.syncBatch(org.mockito.ArgumentMatchers.anyMap())).thenReturn(1);
        SyncController controller = controller(syncService);
        Map<String, List<Map<String, Object>>> payload = Map.of(
                "staff", List.of(Map.of("employeeNo", "GH001")));

        assertThat(controller.syncBatch(payload, requestWithKey()).getData())
                .containsEntry("totalCount", 1);
        verify(syncService).syncBatch(payload);
    }

    private SyncController controller(SyncService syncService) {
        SyncController controller = new SyncController();
        ReflectionTestUtils.setField(controller, "syncService", syncService);
        ReflectionTestUtils.setField(controller, "internalApiKey", "test-internal-key");
        return controller;
    }

    private HttpServletRequest requestWithKey() {
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getHeader("X-Internal-API-Key")).thenReturn("test-internal-key");
        return request;
    }
}
