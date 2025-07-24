#ifndef WINDOWS_SPOOFER_H
#define WINDOWS_SPOOFER_H

#ifdef _WIN32
#include <windows.h>
#include <iphlpapi.h>
#include <wbemidl.h>
#include <comdef.h>
#include <string>
#include <vector>
#include <map>
#include <memory>
#include <functional>

struct SpoofedIdentifiers {
    std::string macAddress;
    std::string diskSerial;
    std::string volumeSerial;
    std::string gpuId;
    std::string biosSerial;
    std::string motherboardSerial;
    bool active;
    DWORD processId;
};

struct OriginalIdentifiers {
    std::string macAddress;
    std::string diskSerial;
    std::string volumeSerial;
    std::string gpuId;
    std::string biosSerial;
    std::string motherboardSerial;
};

class WindowsSpoofer {
public:
    WindowsSpoofer();
    ~WindowsSpoofer();
    
    // Main spoofing operations
    bool InitializeForProcess(DWORD processId);
    bool ApplySpoofing(const SpoofedIdentifiers& identifiers);
    bool RestoreOriginalValues();
    void Cleanup();
    
    // Identifier generation
    SpoofedIdentifiers GenerateRandomIdentifiers();
    OriginalIdentifiers GetOriginalIdentifiers();
    
    // Status and monitoring
    bool IsSpoofingActive() const;
    SpoofedIdentifiers GetCurrentSpoofedValues() const;
    
    // Safe MAC address spoofing
    bool CanSafeMacSpoof() const;
    bool ApplyMacSpoofing(const std::string& newMac);
    
private:
    // API hooking functions
    bool InstallHooks(DWORD processId);
    bool RemoveHooks();
    
    // Individual identifier spoofing
    bool SpoofVolumeSerial(const std::string& newSerial);
    bool SpoofDiskSerial(const std::string& newSerial);
    bool SpoofGpuId(const std::string& newId);
    bool SpoofWmiData(const std::string& biosSerial, const std::string& motherboardSerial);
    
    // Helper functions
    std::string GenerateRandomMac();
    std::string GenerateRandomSerial(int length = 16);
    std::string GetCurrentMacAddress();
    std::string GetCurrentVolumeSerial();
    std::string GetCurrentDiskSerial();
    
    // Process monitoring
    bool IsProcessAlive(DWORD processId);
    void SetupProcessMonitoring(DWORD processId);
    
    // State management
    SpoofedIdentifiers m_currentSpoofed;
    OriginalIdentifiers m_originalValues;
    bool m_initialized;
    bool m_hooksInstalled;
    DWORD m_targetProcessId;
    
    // Hook handles and original function pointers
    std::map<std::string, FARPROC> m_originalFunctions;
    std::vector<HMODULE> m_hookedModules;
};

// Hook function declarations
typedef BOOL (WINAPI *GetVolumeInformationAFunc)(
    LPCSTR lpRootPathName,
    LPSTR lpVolumeNameBuffer,
    DWORD nVolumeNameSize,
    LPDWORD lpVolumeSerialNumber,
    LPDWORD lpMaximumComponentLength,
    LPDWORD lpFileSystemFlags,
    LPSTR lpFileSystemNameBuffer,
    DWORD nFileSystemNameSize
);

typedef DWORD (WINAPI *GetAdaptersInfoFunc)(
    PIP_ADAPTER_INFO AdapterInfo,
    PULONG SizePointer
);

// Hooked function implementations
BOOL WINAPI HookedGetVolumeInformationA(
    LPCSTR lpRootPathName,
    LPSTR lpVolumeNameBuffer,
    DWORD nVolumeNameSize,
    LPDWORD lpVolumeSerialNumber,
    LPDWORD lpMaximumComponentLength,
    LPDWORD lpFileSystemFlags,
    LPSTR lpFileSystemNameBuffer,
    DWORD nFileSystemNameSize
);

DWORD WINAPI HookedGetAdaptersInfo(
    PIP_ADAPTER_INFO AdapterInfo,
    PULONG SizePointer
);

#endif // _WIN32

#endif // WINDOWS_SPOOFER_H