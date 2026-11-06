#include "soilcore.hpp"
#include <cmath>

namespace soilcore {
uint16_t crc16(const uint8_t* data, size_t size) {
  uint16_t crc=0xffff;
  for(size_t i=0;i<size;++i) { crc^=data[i]; for(int j=0;j<8;++j) crc=(crc&1) ? static_cast<uint16_t>((crc>>1)^0xa001) : static_cast<uint16_t>(crc>>1); }
  return crc;
}
std::array<uint8_t,8> request(uint8_t address) {
  std::array<uint8_t,8> r{address,3,0,0,0,4,0,0}; auto crc=crc16(r.data(),6); r[6]=crc&255; r[7]=crc>>8; return r;
}
Result decode(const std::vector<uint8_t>& f, uint8_t address) {
  if(f.size()<5) return {Error::length};
  auto crc=crc16(f.data(),f.size()-2);
  if(f[f.size()-2]!=(crc&255) || f.back()!=(crc>>8)) return {Error::crc};
  if(f[0]!=address) return {Error::address};
  if(f[1]==0x83) return f.size()==5 ? Result{Error::exception,{},f[2]} : Result{Error::length};
  if(f[1]!=3) return {Error::function};
  if(f.size()!=13 || f[2]!=8) return {Error::length};
  auto u=[&](size_t n){return static_cast<unsigned>(f[n])*256+f[n+1];};
  unsigned raw_temp=u(5); int temp=raw_temp>=0x8000 ? static_cast<int>(raw_temp)-65536 : static_cast<int>(raw_temp);
  Reading r{u(3)/10.0,temp/10.0,u(7),u(9)/10.0};
  if(r.moisture_pct>100 || r.temperature_c < -40 || r.temperature_c > 80 || r.ec_us_cm>20000 || r.ph<3 || r.ph>9) return {Error::range};
  return {Error::none,r};
}
const char* error_name(Error e) { switch(e) {
 case Error::none:return "none"; case Error::timeout:return "timeout"; case Error::length:return "length"; case Error::crc:return "crc"; case Error::address:return "address"; case Error::function:return "function"; case Error::exception:return "exception"; case Error::range:return "range";
 } return "unknown"; }
Controller::Controller(Storage& s,size_t cap,double cutoff):storage_(s),capacity_(cap),cutoff_v_(cutoff) {}
bool Controller::start() { state_=State::self_test; if(!storage_.load(next_seq_,queue_) || next_seq_==0 || queue_.size()>capacity_) { state_=State::fault; fault_=Fault::storage_error; return false; } started_=true; state_=State::sleep; return true; }
Result Controller::sample(const std::vector<uint8_t>& frame,bool timed_out,double battery_v) {
  if(!started_) {state_=State::fault; fault_=Fault::storage_error; return {Error::timeout};}
  if(!std::isfinite(battery_v) || battery_v<cutoff_v_) {state_=State::fault; fault_=Fault::low_battery; return {Error::range};}
  state_=State::sensor_power_on; state_=State::warm_up; state_=State::modbus_read;
  if(timed_out) {state_=State::fault; fault_=Fault::sensor_timeout; return {Error::timeout};}
  state_=State::validate; auto r=decode(frame);
  if(r.error!=Error::none) {state_=State::fault; fault_=Fault::invalid_frame; return r;}
  if(queue_.size()>=capacity_) {state_=State::fault; fault_=Fault::storage_full; return r;}
  state_=State::save_to_queue; auto next=queue_; next.push_back({next_seq_,r.reading});
  if(!storage_.save(next_seq_+1,next)) {state_=State::fault; fault_=Fault::storage_error; return r;}
  queue_=std::move(next); ++next_seq_; fault_=Fault::none; state_=State::sleep; return r;
}
bool Controller::flush(Transport& t) {
  if(!started_) return false; state_=State::transmit;
  while(!queue_.empty()) {
    if(!t.send(queue_.front())) {state_=State::fault; fault_=Fault::no_link; return false;}
    auto next=queue_; next.pop_front();
    // A power loss before this commit can replay an acknowledged seq: receiver must deduplicate.
    if(!storage_.save(next_seq_,next)) {state_=State::fault; fault_=Fault::storage_error; return false;}
    queue_=std::move(next);
  }
  fault_=Fault::none; state_=State::sleep; return true;
}
}
