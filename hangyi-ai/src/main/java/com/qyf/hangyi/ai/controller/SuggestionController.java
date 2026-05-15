package com.qyf.hangyi.ai.controller;

import com.qyf.hangyi.ai.service.SuggestionService;
import com.qyf.hangyi.common.result.R;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/ai")
public class SuggestionController {

    @Autowired
    private SuggestionService suggestionService;

    @PostMapping("/scheduling-suggestions")
    public R<?> getSchedulingSuggestions(@RequestBody Map<String, Object> request) {
        return R.ok(suggestionService.getSuggestions(request));
    }

    @PostMapping("/query")
    public R<?> naturalLanguageQuery(@RequestBody Map<String, String> request) {
        return R.ok(suggestionService.query(request.get("query")));
    }

    @PostMapping("/conflict-detection")
    public R<?> detectConflicts(@RequestBody Map<String, Object> request) {
        return R.ok(suggestionService.detectConflicts(request));
    }
}
