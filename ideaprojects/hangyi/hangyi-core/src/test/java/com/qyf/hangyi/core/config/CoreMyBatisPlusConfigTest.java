package com.qyf.hangyi.core.config;

import org.apache.ibatis.annotations.Mapper;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.annotation.MapperScan;

import static org.assertj.core.api.Assertions.assertThat;

class CoreMyBatisPlusConfigTest {

    @Test
    void mapperScanOnlyRegistersInterfacesAnnotatedAsMappers() {
        MapperScan mapperScan = CoreMyBatisPlusConfig.class.getAnnotation(MapperScan.class);

        assertThat(mapperScan).isNotNull();
        assertThat(mapperScan.annotationClass()).isEqualTo(Mapper.class);
    }
}
