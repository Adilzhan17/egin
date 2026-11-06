#include "soilcore.hpp"
#include <iomanip>
#include <iostream>
#include <sstream>
#include <fstream>
#include <cstdio>
#include <cerrno>
#include <memory>
#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#else
#include <fcntl.h>
#include <sys/file.h>
#include <unistd.h>
#endif

using namespace soilcore;
struct MemoryStorage : Storage {
  uint64_t seq=1; std::deque<Sample> samples;
  bool load(uint64_t& n,std::deque<Sample>& q) override {n=seq;q=samples;return true;}
  bool save(uint64_t n,const std::deque<Sample>& q) override {seq=n;samples=q;return true;}
};
// One process per file. Replacement keeps the old snapshot if writing the new one fails.
struct FileStorage : Storage {
  std::string path;
  bool locked=false;
#ifdef _WIN32
  HANDLE lock_handle=INVALID_HANDLE_VALUE;
#else
  int lock_fd=-1;
#endif
  explicit FileStorage(std::string p):path(std::move(p)) {
    const auto lock_path=path+".lock";
#ifdef _WIN32
    lock_handle=CreateFileA(lock_path.c_str(),GENERIC_READ|GENERIC_WRITE,0,nullptr,OPEN_ALWAYS,FILE_ATTRIBUTE_NORMAL,nullptr);
    locked=lock_handle!=INVALID_HANDLE_VALUE;
#else
    lock_fd=open(lock_path.c_str(),O_CREAT|O_RDWR,0600);
    locked=lock_fd>=0 && flock(lock_fd,LOCK_EX|LOCK_NB)==0;
#endif
  }
  ~FileStorage() override {
#ifdef _WIN32
    if(lock_handle!=INVALID_HANDLE_VALUE) CloseHandle(lock_handle);
#else
    if(lock_fd>=0) close(lock_fd);
#endif
  }
  bool load(uint64_t& n,std::deque<Sample>& q) override {
    if(!locked) return false;
    std::ifstream f(path); if(!f) {
      // Distinguish an absent file from errors opening an existing one.
      FILE* existing=std::fopen(path.c_str(),"rb"); if(existing) {std::fclose(existing); return false;} if(errno!=ENOENT) return false;
      n=1; q.clear(); return true; }
    std::string magic; size_t count=0; uint64_t next=0;
    if(!(f>>magic>>next>>count) || magic!="SOILCORE1" || !next || count>1024) return false;
    std::deque<Sample> result; uint64_t previous=0;
    for(size_t i=0;i<count;i++) {Sample s{}; if(!(f>>s.seq>>s.reading.moisture_pct>>s.reading.temperature_c>>s.reading.ec_us_cm>>s.reading.ph) || s.seq<=previous || s.seq>=next) return false; previous=s.seq; result.push_back(s);}
    std::string extra; if(f>>extra) return false;
    n=next; q=std::move(result); return true;
  }
  bool save(uint64_t n,const std::deque<Sample>& q) override {
    if(!locked) return false;
    const std::string tmp=path+".tmp";
    { std::ofstream f(tmp,std::ios::trunc); if(!f)return false; f<<"SOILCORE1 "<<n<<" "<<q.size()<<"\n"<<std::setprecision(17);
      for(const auto& s:q) f<<s.seq<<" "<<s.reading.moisture_pct<<" "<<s.reading.temperature_c<<" "<<s.reading.ec_us_cm<<" "<<s.reading.ph<<"\n";
      f.flush(); if(!f)return false; f.close(); if(!f)return false; }
#ifdef _WIN32
    if(!MoveFileExA(tmp.c_str(),path.c_str(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH)) {std::remove(tmp.c_str());return false;}
#else
    if(std::rename(tmp.c_str(),path.c_str())!=0) {std::remove(tmp.c_str());return false;}
#endif
    return true;
  }
};
struct Link : Transport { bool online=true; std::vector<Sample> delivered; bool send(const Sample& sample) override {if(!online)return false; delivered.push_back(sample); return true;} };
int main(int argc,char** argv) {
  std::unique_ptr<Storage> storage;
  if(argc==1) storage=std::make_unique<MemoryStorage>();
  else if(argc==3 && std::string(argv[1])=="--storage" && argv[2][0]) storage=std::make_unique<FileStorage>(argv[2]);
  else {std::cerr<<"Usage: soilcore_cli [--storage PATH]\n"; return 2;}
  Link link; Controller controller(*storage,1024,2.8); if(!controller.start()) {std::cerr<<"Cannot load storage\n";return 1;}
  std::string line;
  while(std::getline(std::cin,line)) {
    std::istringstream input(line); std::string command; input>>command;
    if(command=="ONLINE" || command=="OFFLINE") {
      link.online=command=="ONLINE"; link.delivered.clear(); if(link.online) controller.flush(link);
      if(controller.fault()==Fault::storage_error) {std::cout<<"{\"ok\":false,\"error\":\"storage\"}"<<std::endl; return 1;}
      std::cout<<"{\"ok\":true,\"online\":"<<(link.online?"true":"false")<<",\"queue_count\":"<<controller.pending()<<",\"delivered\":[";
      bool first=true; for(const auto& sample:link.delivered) {if(!first) std::cout<<","; first=false; const auto& r=sample.reading;
        std::cout<<std::fixed<<std::setprecision(1)<<"{\"seq\":"<<sample.seq<<",\"moisture_pct\":"<<r.moisture_pct<<",\"temperature_c\":"<<r.temperature_c<<",\"ec_us_cm\":"<<r.ec_us_cm<<",\"ph\":"<<r.ph<<"}";}
      std::cout<<"]}"<<std::endl; link.delivered.clear(); continue;
    }
    if(command!="READ" && command!="TIMEOUT") {std::cout<<"{\"ok\":false,\"error\":\"command\"}"<<std::endl; continue;}
    std::vector<uint8_t> frame; std::string token; bool invalid=false;
    while(input>>token) { try {size_t n=0; auto value=std::stoul(token,&n,16); if(n!=token.size() || token.size()!=2 || value>255) invalid=true; else frame.push_back(static_cast<uint8_t>(value));} catch(...) {invalid=true;} }
    if(invalid) {std::cout<<"{\"ok\":false,\"error\":\"hex\"}"<<std::endl; continue;}
    auto before=controller.next_seq(); auto result=controller.sample(frame,command=="TIMEOUT",3.2);
    if(controller.fault()==Fault::storage_error) {std::cout<<"{\"ok\":false,\"error\":\"storage\"}"<<std::endl; return 1;}
    if(result.error!=Error::none || controller.next_seq()==before) {
      std::cout<<"{\"ok\":false,\"error\":\""<<(result.error==Error::none?"queue":error_name(result.error))<<"\",\"queue_count\":"<<controller.pending()<<"}"<<std::endl; continue;
    }
    if(link.online) {controller.flush(link); link.delivered.clear();}
    if(controller.fault()==Fault::storage_error) {std::cout<<"{\"ok\":false,\"error\":\"storage\"}"<<std::endl; return 1;}
    auto& r=result.reading;
    std::cout<<std::fixed<<std::setprecision(1)<<"{\"ok\":true,\"seq\":"<<before<<",\"moisture_pct\":"<<r.moisture_pct<<",\"temperature_c\":"<<r.temperature_c<<",\"ec_us_cm\":"<<r.ec_us_cm<<",\"ph\":"<<r.ph<<",\"quality_flags\":[\"moisture_uncalibrated\",\"ph_requires_lab_validation\"],\"queue_count\":"<<controller.pending()<<"}"<<std::endl;
  }
}
