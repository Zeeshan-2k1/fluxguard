package io.github.zeeshan2k1;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.zeeshan2k1.core.Algorithm;
import io.github.zeeshan2k1.core.FluxGuard;
import io.github.zeeshan2k1.core.FluxGuardConfig;
import java.io.InputStream;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class ParityTest {

  private final ObjectMapper mapper = new ObjectMapper();

  @Test
  void fixedWindowBasic() throws Exception {
    runVector("parity/fixed-window-basic.json");
  }

  @Test
  void tokenBucketBasic() throws Exception {
    runVector("parity/token-bucket-basic.json");
  }

  @Test
  void slidingCounterBasic() throws Exception {
    runVector("parity/sliding-counter-basic.json");
  }

  private void runVector(String path) throws Exception {
    JsonNode root;
    try (InputStream in = getClass().getClassLoader().getResourceAsStream("fixtures/" + path)) {
      assertThat(in).isNotNull();
      root = mapper.readTree(in);
    }
    Algorithm algo = Algorithm.valueOf(root.get("algorithm").asText());
    int limit = root.get("limit").asInt();
    long windowMs = root.get("windowMs").asLong();
    String key = root.get("key").asText();
    var seq = root.get("nowSequence");
    var exp = root.get("expected");
    AtomicInteger idx = new AtomicInteger(0);
    FluxGuard guard =
        new FluxGuard(
            new FluxGuardConfig(
                algo,
                limit,
                windowMs,
                "fluxguard:",
                () -> seq.get(idx.get()).asLong(),
                true,
                null));
    for (int i = 0; i < exp.size(); i++) {
      idx.set(i);
      boolean allowed = guard.check(key).allowed();
      int want = exp.get(i).asInt();
      assertThat(allowed ? 1 : 0).as("step %d", i).isEqualTo(want);
    }
  }
}
