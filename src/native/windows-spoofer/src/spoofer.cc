#include <nan.h>
#include "../include/windows-spoofer.h"
#include <memory>

#ifdef _WIN32

static std::unique_ptr<WindowsSpoofer> g_spoofer;

// Initialize spoofer for target process
NAN_METHOD(InitializeForProcess) {
    if (info.Length() < 1 || !info[0]->IsNumber()) {
        Nan::ThrowTypeError("Process ID required");
        return;
    }
    
    DWORD processId = static_cast<DWORD>(Nan::To<uint32_t>(info[0]).FromJust());
    
    if (!g_spoofer) {
        g_spoofer = std::make_unique<WindowsSpoofer>();
    }
    
    bool success = g_spoofer->InitializeForProcess(processId);
    info.GetReturnValue().Set(Nan::New(success));
}

// Apply spoofing with custom identifiers
NAN_METHOD(ApplySpoofing) {
    if (!g_spoofer) {
        Nan::ThrowError("Spoofer not initialized");
        return;
    }
    
    if (info.Length() < 1 || !info[0]->IsObject()) {
        Nan::ThrowTypeError("Identifiers object required");
        return;
    }
    
    v8::Local<v8::Object> identifiersObj = Nan::To<v8::Object>(info[0]).ToLocalChecked();
    
    SpoofedIdentifiers identifiers = {};
    identifiers.active = true;
    
    // Extract identifiers from JavaScript object
    v8::Local<v8::String> macKey = Nan::New("macAddress").ToLocalChecked();
    v8::Local<v8::String> diskKey = Nan::New("diskSerial").ToLocalChecked();
    v8::Local<v8::String> volumeKey = Nan::New("volumeSerial").ToLocalChecked();
    v8::Local<v8::String> gpuKey = Nan::New("gpuId").ToLocalChecked();
    v8::Local<v8::String> biosKey = Nan::New("biosSerial").ToLocalChecked();
    v8::Local<v8::String> motherboardKey = Nan::New("motherboardSerial").ToLocalChecked();
    
    if (Nan::Has(identifiersObj, macKey).FromJust()) {
        v8::String::Utf8Value macValue(v8::Isolate::GetCurrent(), Nan::Get(identifiersObj, macKey).ToLocalChecked());
        identifiers.macAddress = std::string(*macValue);
    }
    
    if (Nan::Has(identifiersObj, diskKey).FromJust()) {
        v8::String::Utf8Value diskValue(v8::Isolate::GetCurrent(), Nan::Get(identifiersObj, diskKey).ToLocalChecked());
        identifiers.diskSerial = std::string(*diskValue);
    }
    
    if (Nan::Has(identifiersObj, volumeKey).FromJust()) {
        v8::String::Utf8Value volumeValue(v8::Isolate::GetCurrent(), Nan::Get(identifiersObj, volumeKey).ToLocalChecked());
        identifiers.volumeSerial = std::string(*volumeValue);
    }
    
    if (Nan::Has(identifiersObj, gpuKey).FromJust()) {
        v8::String::Utf8Value gpuValue(v8::Isolate::GetCurrent(), Nan::Get(identifiersObj, gpuKey).ToLocalChecked());
        identifiers.gpuId = std::string(*gpuValue);
    }
    
    if (Nan::Has(identifiersObj, biosKey).FromJust()) {
        v8::String::Utf8Value biosValue(v8::Isolate::GetCurrent(), Nan::Get(identifiersObj, biosKey).ToLocalChecked());
        identifiers.biosSerial = std::string(*biosValue);
    }
    
    if (Nan::Has(identifiersObj, motherboardKey).FromJust()) {
        v8::String::Utf8Value motherboardValue(v8::Isolate::GetCurrent(), Nan::Get(identifiersObj, motherboardKey).ToLocalChecked());
        identifiers.motherboardSerial = std::string(*motherboardValue);
    }
    
    bool success = g_spoofer->ApplySpoofing(identifiers);
    info.GetReturnValue().Set(Nan::New(success));
}

// Generate random identifiers
NAN_METHOD(GenerateRandomIdentifiers) {
    if (!g_spoofer) {
        g_spoofer = std::make_unique<WindowsSpoofer>();
    }
    
    SpoofedIdentifiers identifiers = g_spoofer->GenerateRandomIdentifiers();
    
    v8::Local<v8::Object> result = Nan::New<v8::Object>();
    Nan::Set(result, Nan::New("macAddress").ToLocalChecked(), Nan::New(identifiers.macAddress).ToLocalChecked());
    Nan::Set(result, Nan::New("diskSerial").ToLocalChecked(), Nan::New(identifiers.diskSerial).ToLocalChecked());
    Nan::Set(result, Nan::New("volumeSerial").ToLocalChecked(), Nan::New(identifiers.volumeSerial).ToLocalChecked());
    Nan::Set(result, Nan::New("gpuId").ToLocalChecked(), Nan::New(identifiers.gpuId).ToLocalChecked());
    Nan::Set(result, Nan::New("biosSerial").ToLocalChecked(), Nan::New(identifiers.biosSerial).ToLocalChecked());
    Nan::Set(result, Nan::New("motherboardSerial").ToLocalChecked(), Nan::New(identifiers.motherboardSerial).ToLocalChecked());
    
    info.GetReturnValue().Set(result);
}

// Get current spoofing status
NAN_METHOD(GetSpoofingStatus) {
    if (!g_spoofer) {
        v8::Local<v8::Object> result = Nan::New<v8::Object>();
        Nan::Set(result, Nan::New("active").ToLocalChecked(), Nan::New(false));
        info.GetReturnValue().Set(result);
        return;
    }
    
    bool isActive = g_spoofer->IsSpoofingActive();
    SpoofedIdentifiers current = g_spoofer->GetCurrentSpoofedValues();
    
    v8::Local<v8::Object> result = Nan::New<v8::Object>();
    Nan::Set(result, Nan::New("active").ToLocalChecked(), Nan::New(isActive));
    
    if (isActive) {
        v8::Local<v8::Object> identifiers = Nan::New<v8::Object>();
        Nan::Set(identifiers, Nan::New("macAddress").ToLocalChecked(), Nan::New(current.macAddress).ToLocalChecked());
        Nan::Set(identifiers, Nan::New("diskSerial").ToLocalChecked(), Nan::New(current.diskSerial).ToLocalChecked());
        Nan::Set(identifiers, Nan::New("volumeSerial").ToLocalChecked(), Nan::New(current.volumeSerial).ToLocalChecked());
        Nan::Set(identifiers, Nan::New("gpuId").ToLocalChecked(), Nan::New(current.gpuId).ToLocalChecked());
        Nan::Set(identifiers, Nan::New("biosSerial").ToLocalChecked(), Nan::New(current.biosSerial).ToLocalChecked());
        Nan::Set(identifiers, Nan::New("motherboardSerial").ToLocalChecked(), Nan::New(current.motherboardSerial).ToLocalChecked());
        
        Nan::Set(result, Nan::New("identifiers").ToLocalChecked(), identifiers);
    }
    
    info.GetReturnValue().Set(result);
}

// Restore original identifiers
NAN_METHOD(RestoreOriginalIdentifiers) {
    if (!g_spoofer) {
        Nan::ThrowError("Spoofer not initialized");
        return;
    }
    
    bool success = g_spoofer->RestoreOriginalValues();
    info.GetReturnValue().Set(Nan::New(success));
}

// Cleanup spoofer
NAN_METHOD(Cleanup) {
    if (g_spoofer) {
        g_spoofer->Cleanup();
        g_spoofer.reset();
    }
    info.GetReturnValue().Set(Nan::New(true));
}

// Check if safe MAC spoofing is possible
NAN_METHOD(CanSafeMacSpoof) {
    if (!g_spoofer) {
        info.GetReturnValue().Set(Nan::New(false));
        return;
    }
    
    bool canSpoof = g_spoofer->CanSafeMacSpoof();
    info.GetReturnValue().Set(Nan::New(canSpoof));
}

// Module initialization
NAN_MODULE_INIT(InitModule) {
    Nan::Set(target, Nan::New("initializeForProcess").ToLocalChecked(),
             Nan::GetFunction(Nan::New<v8::FunctionTemplate>(InitializeForProcess)).ToLocalChecked());
    
    Nan::Set(target, Nan::New("applySpoofing").ToLocalChecked(),
             Nan::GetFunction(Nan::New<v8::FunctionTemplate>(ApplySpoofing)).ToLocalChecked());
    
    Nan::Set(target, Nan::New("generateRandomIdentifiers").ToLocalChecked(),
             Nan::GetFunction(Nan::New<v8::FunctionTemplate>(GenerateRandomIdentifiers)).ToLocalChecked());
    
    Nan::Set(target, Nan::New("getSpoofingStatus").ToLocalChecked(),
             Nan::GetFunction(Nan::New<v8::FunctionTemplate>(GetSpoofingStatus)).ToLocalChecked());
    
    Nan::Set(target, Nan::New("restoreOriginalIdentifiers").ToLocalChecked(),
             Nan::GetFunction(Nan::New<v8::FunctionTemplate>(RestoreOriginalIdentifiers)).ToLocalChecked());
    
    Nan::Set(target, Nan::New("cleanup").ToLocalChecked(),
             Nan::GetFunction(Nan::New<v8::FunctionTemplate>(Cleanup)).ToLocalChecked());
    
    Nan::Set(target, Nan::New("canSafeMacSpoof").ToLocalChecked(),
             Nan::GetFunction(Nan::New<v8::FunctionTemplate>(CanSafeMacSpoof)).ToLocalChecked());
}

NODE_MODULE(windows_spoofer, InitModule)

#else

// Non-Windows stub implementation
NAN_METHOD(StubMethod) {
    Nan::ThrowError("Windows spoofing is only supported on Windows platforms");
}

NAN_MODULE_INIT(InitModule) {
    Nan::Set(target, Nan::New("initializeForProcess").ToLocalChecked(),
             Nan::GetFunction(Nan::New<v8::FunctionTemplate>(StubMethod)).ToLocalChecked());
    // Add other stub methods...
}

NODE_MODULE(windows_spoofer, InitModule)

#endif