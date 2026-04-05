// Spring Boot entrypoint for FluxGuard Java benchmark HTTP API.
package io.github.zeeshan2k1.example;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class BenchmarkApplication {

  public static void main(String[] args) {
    SpringApplication.run(BenchmarkApplication.class, args);
  }
}
