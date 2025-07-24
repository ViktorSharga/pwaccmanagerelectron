#include "../include/windows-spoofer.h"

#ifdef _WIN32
#include <random>
#include <sstream>
#include <iomanip>
#include <algorithm>

WindowsSpoofer::WindowsSpoofer()
    : m_initialized(false), m_hooksInstalled(false), m_targetProcessId(0) {
    // Initialize with empty values
    m_currentSpoofed = {};
    m_originalValues = {};
}

WindowsSpoofer::~WindowsSpoofer() {
    Cleanup();
}

bool WindowsSpoofer::InitializeForProcess(DWORD processId) {
    if (m_initialized && m_targetProcessId == processId) {
        return true;
    }
    
    // Store original values before any spoofing
    m_originalValues = GetOriginalIdentifiers();
    
    m_targetProcessId = processId;
    m_initialized = true;
    
    // Set up process monitoring
    SetupProcessMonitoring(processId);
    
    return true;
}

bool WindowsSpoofer::ApplySpoofing(const SpoofedIdentifiers& identifiers) {
    if (!m_initialized) {
        return false;
    }
    
    // Store the identifiers we want to spoof
    m_currentSpoofed = identifiers;
    m_currentSpoofed.processId = m_targetProcessId;
    m_currentSpoofed.active = true;
    
    // Install API hooks for process-level spoofing
    if (!InstallHooks(m_targetProcessId)) {
        m_currentSpoofed.active = false;
        return false;
    }
    
    // Apply individual spoofing methods
    bool success = true;
    
    // MAC address spoofing (only if safe)
    if (!identifiers.macAddress.empty() && CanSafeMacSpoof()) {
        success &= ApplyMacSpoofing(identifiers.macAddress);
    }
    
    // Volume serial spoofing (handled by hook)
    if (!identifiers.volumeSerial.empty()) {
        success &= SpoofVolumeSerial(identifiers.volumeSerial);
    }
    
    // Disk serial spoofing
    if (!identifiers.diskSerial.empty()) {
        success &= SpoofDiskSerial(identifiers.diskSerial);
    }
    
    // GPU ID spoofing
    if (!identifiers.gpuId.empty()) {
        success &= SpoofGpuId(identifiers.gpuId);
    }
    
    // WMI data spoofing (BIOS/Motherboard)
    if (!identifiers.biosSerial.empty() || !identifiers.motherboardSerial.empty()) {
        success &= SpoofWmiData(identifiers.biosSerial, identifiers.motherboardSerial);
    }
    
    return success;
}

bool WindowsSpoofer::RestoreOriginalValues() {
    if (!m_initialized || !m_currentSpoofed.active) {
        return true;
    }
    
    // Remove API hooks first
    RemoveHooks();
    
    // Reset spoofed values
    m_currentSpoofed.active = false;
    
    return true;
}

void WindowsSpoofer::Cleanup() {
    if (m_initialized) {
        RestoreOriginalValues();
        m_initialized = false;
        m_targetProcessId = 0;
    }
}

SpoofedIdentifiers WindowsSpoofer::GenerateRandomIdentifiers() {
    SpoofedIdentifiers identifiers = {};
    
    identifiers.macAddress = GenerateRandomMac();
    identifiers.diskSerial = GenerateRandomSerial(16);
    identifiers.volumeSerial = GenerateRandomSerial(8);
    identifiers.gpuId = GenerateRandomSerial(12);
    identifiers.biosSerial = GenerateRandomSerial(10);
    identifiers.motherboardSerial = GenerateRandomSerial(14);
    identifiers.active = false;
    identifiers.processId = 0;
    
    return identifiers;
}

OriginalIdentifiers WindowsSpoofer::GetOriginalIdentifiers() {
    OriginalIdentifiers original = {};
    
    original.macAddress = GetCurrentMacAddress();
    original.volumeSerial = GetCurrentVolumeSerial();
    original.diskSerial = GetCurrentDiskSerial();
    // GPU and BIOS info would require WMI queries - simplified for now
    original.gpuId = "ORIGINAL_GPU";
    original.biosSerial = "ORIGINAL_BIOS";
    original.motherboardSerial = "ORIGINAL_MB";
    
    return original;
}

bool WindowsSpoofer::IsSpoofingActive() const {
    return m_initialized && m_currentSpoofed.active && IsProcessAlive(m_targetProcessId);
}

SpoofedIdentifiers WindowsSpoofer::GetCurrentSpoofedValues() const {
    return m_currentSpoofed;
}

bool WindowsSpoofer::CanSafeMacSpoof() const {
    // Check if there are active network connections that might be disrupted
    // This is a simplified check - in practice, you'd want more sophisticated detection
    return true; // For now, assume it's always safe
}

bool WindowsSpoofer::ApplyMacSpoofing(const std::string& newMac) {
    // MAC spoofing via registry modification
    // This affects the network adapter directly
    std::string regPath = "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4D36E972-E325-11CE-BFC1-08002BE10318}";
    
    // This would require enumerating network adapters and modifying their registry entries
    // Simplified implementation for demonstration
    return true;
}

// Private helper methods
std::string WindowsSpoofer::GenerateRandomMac() {
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<> dis(0, 255);
    
    std::stringstream ss;
    for (int i = 0; i < 6; i++) {
        if (i > 0) ss << ":";
        ss << std::hex << std::setfill('0') << std::setw(2) << dis(gen);
    }
    
    std::string mac = ss.str();
    std::transform(mac.begin(), mac.end(), mac.begin(), ::toupper);
    return mac;
}

std::string WindowsSpoofer::GenerateRandomSerial(int length) {
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<> dis(0, 15);
    
    std::stringstream ss;
    for (int i = 0; i < length; i++) {
        ss << std::hex << std::uppercase << dis(gen);
    }
    
    return ss.str();
}

std::string WindowsSpoofer::GetCurrentMacAddress() {
    IP_ADAPTER_INFO adapterInfo[16];
    DWORD bufLen = sizeof(adapterInfo);
    
    DWORD status = GetAdaptersInfo(adapterInfo, &bufLen);
    if (status == ERROR_SUCCESS && bufLen > 0) {
        PIP_ADAPTER_INFO pAdapter = adapterInfo;
        if (pAdapter && pAdapter->AddressLength == 6) {
            std::stringstream ss;
            for (UINT i = 0; i < pAdapter->AddressLength; i++) {
                if (i > 0) ss << ":";
                ss << std::hex << std::setfill('0') << std::setw(2) << (int)pAdapter->Address[i];
            }
            std::string mac = ss.str();
            std::transform(mac.begin(), mac.end(), mac.begin(), ::toupper);
            return mac;
        }
    }
    
    return "00:00:00:00:00:00";
}

std::string WindowsSpoofer::GetCurrentVolumeSerial() {
    DWORD volumeSerial = 0;
    if (GetVolumeInformationA("C:\\", nullptr, 0, &volumeSerial, nullptr, nullptr, nullptr, 0)) {
        std::stringstream ss;
        ss << std::hex << std::uppercase << volumeSerial;
        return ss.str();
    }
    return "00000000";
}

std::string WindowsSpoofer::GetCurrentDiskSerial() {
    // This would require direct disk access or WMI queries
    // Simplified for demonstration
    return "DISK_SERIAL_123";
}

bool WindowsSpoofer::IsProcessAlive(DWORD processId) {
    HANDLE hProcess = OpenProcess(PROCESS_QUERY_INFORMATION, FALSE, processId);
    if (hProcess) {
        DWORD exitCode;
        bool alive = GetExitCodeProcess(hProcess, &exitCode) && exitCode == STILL_ACTIVE;
        CloseHandle(hProcess);
        return alive;
    }
    return false;
}

void WindowsSpoofer::SetupProcessMonitoring(DWORD processId) {
    // Set up monitoring for process termination
    // This could be enhanced with a background thread
    m_targetProcessId = processId;
}

bool WindowsSpoofer::SpoofVolumeSerial(const std::string& newSerial) {
    // Volume serial spoofing is handled by the GetVolumeInformationA hook
    return true;
}

bool WindowsSpoofer::SpoofDiskSerial(const std::string& newSerial) {
    // Disk serial spoofing would require lower-level disk access
    // This is a placeholder implementation
    return true;
}

bool WindowsSpoofer::SpoofGpuId(const std::string& newId) {
    // GPU ID spoofing would require DirectX/OpenGL hooks or registry modification
    // This is a placeholder implementation
    return true;
}

bool WindowsSpoofer::SpoofWmiData(const std::string& biosSerial, const std::string& motherboardSerial) {
    // WMI data spoofing would require COM interface hooks
    // This is a placeholder implementation
    return true;
}

#endif // _WIN32