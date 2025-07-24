# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude Requirements Gathering System - An intelligent requirements gathering system for Claude Code that progressively builds context through automated discovery, asks simple yes/no questions, and generates comprehensive requirements documentation.

## Commands

This project uses custom Claude slash commands stored in `commands/` directory:

- `/requirements-start [description]` - Begin gathering requirements for a new feature
- `/requirements-status` or `/requirements-current` - Check progress and continue gathering  
- `/requirements-end` - Finalize current requirement
- `/requirements-list` - List all requirements with their status
- `/remind` or `/requirements-remind` - Remind AI to follow requirements gathering rules

## Architecture & Structure

### Core Components

1. **Commands System** (`commands/`)
   - Each `.md` file defines a slash command
   - Commands orchestrate the requirements gathering workflow
   - Key command: `requirements-start.md` contains the full workflow implementation

2. **Requirements Storage** (`requirements/`)
   - `.current-requirement` - Tracks active requirement folder
   - `index.md` - Summary of all requirements
   - Individual requirement folders: `YYYY-MM-DD-HHMM-[slug]/`
   - Metadata tracking in `metadata.json`

3. **Five-Phase Workflow**
   - Phase 1: Initial setup & codebase analysis
   - Phase 2: 5 context discovery questions (yes/no with defaults)
   - Phase 3: Autonomous targeted context gathering
   - Phase 4: 5 expert requirements questions (yes/no with defaults)
   - Phase 5: Requirements documentation generation

### Key Implementation Details

**Question Format Rules:**
- ONLY yes/no questions allowed
- Must include smart defaults based on best practices
- Ask ONE question at a time
- Write ALL questions to file BEFORE asking any
- Record answers only AFTER all questions are answered

**File Structure for Requirements:**
```
requirements/YYYY-MM-DD-HHMM-[slug]/
├── metadata.json              # Status tracking
├── 00-initial-request.md      # User's original request  
├── 01-discovery-questions.md  # 5 context questions
├── 02-discovery-answers.md    # User's answers
├── 03-context-findings.md     # AI's code analysis
├── 04-detail-questions.md     # 5 expert questions
├── 05-detail-answers.md       # User's detailed answers
└── 06-requirements-spec.md    # Final requirements
```

**Metadata Structure:**
```json
{
  "id": "feature-slug",
  "started": "ISO-8601-timestamp",
  "lastUpdated": "ISO-8601-timestamp", 
  "status": "active",
  "phase": "discovery|context|detail|complete",
  "progress": {
    "discovery": { "answered": 0, "total": 5 },
    "detail": { "answered": 0, "total": 0 }
  }
}
```

## Working with Requirements

When implementing a requirement from this system:
1. Read the complete requirement spec in `06-requirements-spec.md`
2. Note the specific file paths and patterns identified during context gathering
3. Follow the implementation notes and suggested libraries
4. Use acceptance criteria for testing

When continuing an interrupted session:
1. Use `/requirements-status` to check current phase
2. AI will automatically resume from the correct point
3. All progress is preserved in metadata.json

## Important Patterns

- Slug generation: Extract from user description (e.g., "add user profile" → "user-profile")
- Phase transitions: Announce completion before moving to next phase
- Error handling: "idk" means use the default value
- File management: All files created automatically by the system