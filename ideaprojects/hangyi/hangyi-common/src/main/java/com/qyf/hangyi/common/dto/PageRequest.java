package com.qyf.hangyi.common.dto;

import lombok.Data;

@Data
public class PageRequest {
    private int page = 1;
    private int size = 10;
}
