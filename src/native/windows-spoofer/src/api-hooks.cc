#include "../include/windows-spoofer.h"

#ifdef _WIN32
#include <detours.h>
#include <random>
#include <sstream>
#include <iomanip>

// Global variables for hook management
static WindowsSpoofer* g_spooferInstance = nullptr;
static GetVolumeInformationAFunc g_originalGetVolumeInformationA = nullptr;
static GetAdaptersInfoFunc g_originalGetAdaptersInfo = nullptr;

// Hooked GetVolumeInformationA function
BOOL WINAPI HookedGetVolumeInformationA(
    LPCSTR lpRootPathName,
    LPSTR lpVolumeNameBuffer,
    DWORD nVolumeNameSize,
    LPDWORD lpVolumeSerialNumber,
    LPDWORD lpMaximumComponentLength,
    LPDWORD lpFileSystemFlags,
    LPSTR lpFileSystemNameBuffer,
    DWORD nFileSystemNameSize
) {
    // Call original function first
    BOOL result = g_originalGetVolumeInformationA(
        lpRootPathName,
        lpVolumeNameBuffer,
        nVolumeNameSize,
        lpVolumeSerialNumber,
        lpMaximumComponentLength,
        lpFileSystemFlags,
        lpFileSystemNameBuffer,
        nFileSystemNameSize
    );
    
    // If spoofer is active and we have a custom volume serial, use it
    if (g_spooferInstance && g_spooferInstance->IsSpoofingActive() && lpVolumeSerialNumber) {
        SpoofedIdentifiers current = g_spooferInstance->GetCurrentSpoofedValues();
        if (!current.volumeSerial.empty()) {
            try {
                DWORD spoofedSerial = std::stoul(current.volumeSerial, nullptr, 16);
                *lpVolumeSerialNumber = spoofedSerial;
            } catch (...) {
                // If conversion fails, use original value
            }
        }
    }
    
    return result;
}

// Hooked GetAdaptersInfo function
DWORD WINAPI HookedGetAdaptersInfo(
    PIP_ADAPTER_INFO AdapterInfo,
    PULONG SizePointer
) {
    DWORD result = g_originalGetAdaptersInfo(AdapterInfo, SizePointer);
    
    // If spoofer is active and we have adapter info, modify MAC addresses
    if (g_spooferInstance && g_spooferInstance->IsSpoofingActive() && 
        result == NO_ERROR && AdapterInfo) {
        
        SpoofedIdentifiers current = g_spooferInstance->GetCurrentSpoofedValues();
        if (!current.macAddress.empty()) {
            PIP_ADAPTER_INFO pAdapter = AdapterInfo;
            while (pAdapter) {
                // Parse the spoofed MAC address and apply it
                std::string mac = current.macAddress;
                if (mac.length() >= 12) {
                    for (int i = 0; i < 6 && i < pAdapter->AddressLength; i++) {
                        std::string byteStr = mac.substr(i * 2, 2);
                        try {
                            pAdapter->Address[i] = static_cast<BYTE>(std::stoul(byteStr, nullptr, 16));
                        } catch (...) {
                            // If conversion fails, keep original
                            break;
                        }
                    }
                }
                pAdapter = pAdapter->Next;
            }
        }
    }
    
    return result;
}

bool WindowsSpoofer::InstallHooks(DWORD processId) {
    if (m_hooksInstalled) {
        return true;
    }
    
    // Set global instance for hook functions
    g_spooferInstance = this;
    
    // Get handles to target modules
    HMODULE hKernel32 = GetModuleHandleA("kernel32.dll");
    HMODULE hIphlpapi = GetModuleHandleA("iphlpapi.dll");
    
    if (!hKernel32) {
        return false;
    }
    
    // Get original function addresses
    g_originalGetVolumeInformationA = reinterpret_cast<GetVolumeInformationAFunc>(
        GetProcAddress(hKernel32, "GetVolumeInformationA")
    );
    
    if (hIphlpapi) {
        g_originalGetAdaptersInfo = reinterpret_cast<GetAdaptersInfoFunc>(
            GetProcAddress(hIphlpapi, "GetAdaptersInfo")
        );
    }
    
    if (!g_originalGetVolumeInformationA) {
        return false;
    }
    
    // Install hooks using Detours
    DetourTransactionBegin();
    DetourUpdateProcessModules();
    
    if (g_originalGetVolumeInformationA) {
        DetourAttach(&reinterpret_cast<PVOID&>(g_originalGetVolumeInformationA), HookedGetVolumeInformationA);
    }
    
    if (g_originalGetAdaptersInfo) {
        DetourAttach(&reinterpret_cast<PVOID&>(g_originalGetAdaptersInfo), HookedGetAdaptersInfo);
    }
    
    LONG result = DetourTransactionCommit();
    
    if (result == NO_ERROR) {
        m_hooksInstalled = true;
        return true;
    }
    
    return false;
}

bool WindowsSpoofer::RemoveHooks() {
    if (!m_hooksInstalled) {
        return true;
    }
    
    DetourTransactionBegin();
    DetourUpdateProcessModules();
    
    if (g_originalGetVolumeInformationA) {
        DetourDetach(&reinterpret_cast<PVOID&>(g_originalGetVolumeInformationA), HookedGetVolumeInformationA);
    }
    
    if (g_originalGetAdaptersInfo) {
        DetourDetach(&reinterpret_cast<PVOID&>(g_originalGetAdaptersInfo), HookedGetAdaptersInfo);
    }
    
    LONG result = DetourTransactionCommit();
    
    if (result == NO_ERROR) {
        m_hooksInstalled = false;
        g_spooferInstance = nullptr;
        return true;
    }
    
    return false;
}

#endif // _WIN32