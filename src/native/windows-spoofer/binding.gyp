{
  "targets": [
    {
      "target_name": "windows_spoofer",
      "sources": [
        "src/spoofer.cc",
        "src/api-hooks.cc",
        "src/identifier-manager.cc"
      ],
      "include_dirs": [
        "<!(node -e \"require('nan')\")",
        "include"
      ],
      "conditions": [
        ["OS=='win'", {
          "libraries": [
            "-ladvapi32",
            "-lkernel32",
            "-luser32",
            "-liphlpapi",
            "-lole32",
            "-loleaut32",
            "-lwbemuuid"
          ],
          "defines": [
            "WIN32_LEAN_AND_MEAN",
            "NOMINMAX"
          ]
        }]
      ],
      "cflags_cc": [
        "-std=c++17",
        "-fexceptions"
      ],
      "msvs_settings": {
        "VCCLCompilerTool": {
          "ExceptionHandling": 1,
          "AdditionalOptions": ["/std:c++17"]
        }
      }
    }
  ]
}