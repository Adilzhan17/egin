#pragma once
#include <array>
#include <cstdint>
#include <deque>
#include <string>
#include <vector>

namespace soilcore {
struct Reading { double moisture_pct, temperature_c; unsigned ec_us_cm; double ph; };
enum class Error { none, timeout, length, crc, address, function, exception, range };
struct Result { Error error; Reading reading{}; uint8_t exception_code = 0; };
uint16_t crc16(const uint8_t* data, size_t size);
std::array<uint8_t, 8> request(uint8_t address = 1);
Result decode(const std::vector<uint8_t>& frame, uint8_t address = 1);
const char* error_name(Error e);

struct Sample { uint64_t seq; Reading reading; };
// Storage must atomically save both next sequence and the complete pending queue.
struct Storage { virtual ~Storage() = default; virtual bool load(uint64_t&, std::deque<Sample>&) = 0; virtual bool save(uint64_t, const std::deque<Sample>&) = 0; };
struct Transport { virtual ~Transport() = default; virtual bool send(const Sample&) = 0; };
enum class State { boot, self_test, sleep, sensor_power_on, warm_up, modbus_read, validate, save_to_queue, transmit, fault };
enum class Fault { none, sensor_timeout, invalid_frame, low_battery, no_link, storage_full, storage_error };
// The platform is responsible for powering/warming the sensor and timing each call.
class Controller {
 public:
  Controller(Storage& storage, size_t capacity, double cutoff_v);
  bool start();
  Result sample(const std::vector<uint8_t>& frame, bool timed_out, double battery_v);
  bool flush(Transport& transport);
  State state() const { return state_; }
  Fault fault() const { return fault_; }
  size_t pending() const { return queue_.size(); }
  uint64_t next_seq() const { return next_seq_; }
 private:
  Storage& storage_; size_t capacity_; double cutoff_v_; uint64_t next_seq_=1;
  std::deque<Sample> queue_; State state_=State::boot; Fault fault_=Fault::none; bool started_=false;
};
}
