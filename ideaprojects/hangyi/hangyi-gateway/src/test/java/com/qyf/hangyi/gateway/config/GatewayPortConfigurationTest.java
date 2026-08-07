package com.qyf.hangyi.gateway.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.MutablePropertySources;
import org.springframework.core.env.PropertySource;
import org.springframework.core.env.PropertySourcesPropertyResolver;
import org.springframework.core.io.FileSystemResource;

import java.io.IOException;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class GatewayPortConfigurationTest {

    private final YamlPropertySourceLoader loader = new YamlPropertySourceLoader();

    @Test
    void defaultRoutesUseTheProjectPortMatrix() throws IOException {
        PropertySourcesPropertyResolver resolver = resolverFor("application.yml");

        assertEquals("9000", resolver.getProperty("server.port"));
        assertEquals(
                "http://localhost:9001",
                resolver.getProperty("spring.cloud.gateway.routes[0].uri")
        );
        assertEquals(
                "http://localhost:9002",
                resolver.getProperty("spring.cloud.gateway.routes[1].uri")
        );
        assertEquals(
                "http://localhost:9004",
                resolver.getProperty("spring.cloud.gateway.routes[2].uri")
        );
        assertEquals(
                "http://localhost:5173,http://localhost:9003",
                resolver.getProperty("cors.allowed-origins")
        );
    }

    @Test
    void localProfileDoesNotReplaceTheCompleteRouteList() throws IOException {
        PropertySourcesPropertyResolver resolver = resolverFor("application-local.yml");

        assertNull(resolver.getProperty("spring.cloud.gateway.routes[0].uri"));
    }

    private PropertySourcesPropertyResolver resolverFor(String resource) throws IOException {
        Path resourcePath = Path.of(
                System.getProperty("basedir"),
                "src",
                "main",
                "resources",
                resource
        );
        List<PropertySource<?>> loaded = loader.load(resource, new FileSystemResource(resourcePath));
        MutablePropertySources sources = new MutablePropertySources();
        loaded.forEach(sources::addLast);
        return new PropertySourcesPropertyResolver(sources);
    }
}
