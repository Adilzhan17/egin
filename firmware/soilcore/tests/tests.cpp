#include "soilcore.hpp"
#include <cassert>
#include <cmath>
#include <iostream>
#include <vector>
using namespace soilcore;
struct Memory : Storage { uint64_t n=1; std::deque<Sample> q; bool load(uint64_t& seq,std::deque<Sample>& out) override {seq=n;out=q;return true;} bool save(uint64_t seq,const std::deque<Sample>& in) override {n=seq;q=in;return true;} };
struct Link : Transport { bool online=false; std::vector<uint64_t> delivered; bool send(const Sample& s) override {if(!online)return false;delivered.push_back(s.seq);return true;} };
int main() {
 std::vector<uint8_t> frame{0x01,0x03,0x08,0x02,0x92,0xff,0x9b,0x03,0xe8,0,0x38,0x57,0xb6};
 auto req=request(); assert((req==std::array<uint8_t,8>{1,3,0,0,0,4,0x44,9}));
 auto r=decode(frame); assert(r.error==Error::none); assert(std::abs(r.reading.moisture_pct-65.8)<0.001); assert(std::abs(r.reading.temperature_c+10.1)<0.001); assert(r.reading.ec_us_cm==1000); assert(std::abs(r.reading.ph-5.6)<0.001);
 auto corrupt=frame; corrupt[4]^=1; assert(decode(corrupt).error==Error::crc); assert(decode({1,3}).error==Error::length);
 assert(decode(frame,2).error==Error::address);
 std::vector<uint8_t> ex{1,0x83,2}; auto crc=crc16(ex.data(),ex.size()); ex.push_back(crc&255); ex.push_back(crc>>8); assert(decode(ex).error==Error::exception); assert(decode(ex).exception_code==2);
 Memory memory; Controller c(memory,2,2.8); assert(c.start()); assert(c.sample({},true,3.2).error==Error::timeout); assert(c.fault()==Fault::sensor_timeout);
 c.sample(frame,false,2.5); assert(c.fault()==Fault::low_battery); assert(c.pending()==0);
 c.sample(frame,false,3.2); c.sample(frame,false,3.2); assert(c.pending()==2); c.sample(frame,false,3.2); assert(c.fault()==Fault::storage_full); assert(c.pending()==2);
 Link link; assert(!c.flush(link)); assert(c.fault()==Fault::no_link); assert(c.pending()==2);
 Controller reboot(memory,2,2.8); assert(reboot.start()); assert(reboot.pending()==2); assert(reboot.next_seq()==3); link.online=true; assert(reboot.flush(link)); assert((link.delivered==std::vector<uint64_t>{1,2})); assert(reboot.pending()==0); reboot.sample(frame,false,3.2); assert(reboot.next_seq()==4);
 std::cout<<"All SoilCore tests passed\n";
}
