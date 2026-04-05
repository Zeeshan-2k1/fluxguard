-- KEYS[1] = counter key for window
-- ARGV[1] = limit, ARGV[2] = window_ms, ARGV[3] = now_ms, ARGV[4] = window_start
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local current = tonumber(redis.call('GET', KEYS[1])) or 0
if current >= limit then
  local reset = tonumber(ARGV[4]) + window
  return {0, current, limit, reset}
end
local next = redis.call('INCR', KEYS[1])
if next == 1 then
  redis.call('PEXPIRE', KEYS[1], window * 2)
end
local reset = tonumber(ARGV[4]) + window
return {1, limit - next, limit, reset}
