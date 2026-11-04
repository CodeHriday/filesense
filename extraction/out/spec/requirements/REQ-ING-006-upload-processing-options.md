---
id: REQ-ING-006
title: Validate delimiter, header and fixed-width layout options supplied with an upload
module: backend
status: draft
owner: "@OWNER"
depends_on: []
contracts: []
priority: must
---
# REQ-ING-006: Validate delimiter, header and fixed-width layout options supplied with an upload

## Context
Users uploading headerless or unusual files can tell processing how to read them: a delimiter, a header setting with column names, and a fixed-width layout. Today malformed values are silently replaced with "none" and the upload goes ahead, so the file is then profiled with the wrong layout. The F47 decision is to validate before saving. The options apply to every file in the request.

## Requirements
1. The system shall accept an optional delimiter, an optional header setting and an optional fixed-width layout with an upload request.
2. If a delimiter is supplied, the system shall require it to be a non-empty string.
3. If a header setting is supplied, the system shall require a has-header flag (true or false) and, when the flag is false, an optional list of column names that are non-empty strings.
4. If a fixed-width layout is supplied, the system shall require a non-empty list of columns, each with a non-empty name, a width that is a whole number greater than 0, and an optional type.
5. If any supplied option is malformed, then the system shall reject the whole request with 400, code `INVALID_OPTIONS`, and a message naming the option.
6. When the options are valid, the system shall pass them unchanged to the processing job of every file in the request and store them with each file.

## Acceptance criteria
- **AC-1**: Given delimiter `|`, When a `.txt` file is uploaded, Then processing receives delimiter `|`. <!-- source: areas/ING.md#post-apifilesupload-serverjs2557-3439 -->
- **AC-2**: Given delimiter `||` (two characters), When a file is uploaded, Then the upload is accepted and processing receives `||`. <!-- source: areas/ING.md#post-apifilesupload-serverjs2557-3439 -->
- **AC-3**: Given a header setting `{hasHeader:false, columnNames:["id","name"]}`, When a file is uploaded, Then processing receives that header setting. <!-- source: areas/ING.md#post-apifilesupload-serverjs2557-3439 -->
- **AC-4**: Given a header setting that is not valid JSON, When a file is uploaded, Then the response is 400 `INVALID_OPTIONS` naming the header setting, and no file is accepted. <!-- source: areas/ING.md#post-apifilesupload-serverjs2557-3439 -->
- **AC-5**: Given a fixed-width layout `{columns:[{name:"id",width:5},{name:"amt",width:12,type:"number"}]}`, When a `.dat` file is uploaded, Then processing receives that layout. <!-- source: areas/ING.md#post-apifilesupload-serverjs2557-3439 -->
- **AC-6**: Given a fixed-width layout with a column of width 0, When a file is uploaded, Then the response is 400 `INVALID_OPTIONS`. <!-- source: areas/ING.md#fe-upload-and-drop-srcappjsx342-343 -->
- **AC-7**: Given a fixed-width layout with a column of width "7a", When a file is uploaded, Then the response is 400 `INVALID_OPTIONS`. <!-- source: areas/ING.md#fe-upload-and-drop-srcappjsx342-343 -->
- **AC-8**: Given a fixed-width layout with an empty column list, When a file is uploaded, Then the response is 400 `INVALID_OPTIONS`. <!-- source: areas/ING.md#post-apifilesupload-serverjs2557-3439 -->
- **AC-9**: Given no options, When a CSV is uploaded, Then the upload is accepted and processing detects the layout itself. <!-- source: areas/ING.md#post-apifilesupload-serverjs2557-3439 -->

## Out of scope
- How processing and profiling apply the options (processing and profiling areas).
- Editing a file's fixed-width layout after upload (schema area).
- Defaulting the layout from an agreement file schema (REQ-ING-021).

## Non-functional requirements
None.

## Data volume and performance
Not data-bearing: option payloads are small; see Open questions for size bounds.

## Edge cases and errors
- An empty delimiter string is treated as "not supplied".
- A layout that was double JSON-encoded by an older client is rejected as malformed (the old server unwrapped it).
- Duplicate column names in a layout: see Open questions.

## Open questions
- Maximum delimiter length, maximum number of layout columns and maximum column-name length? The old code set no bounds.
- Are duplicate column names in a fixed-width layout or header list allowed?
- Allowed values for a layout column's type? The old code accepted any string, defaulting to `string`.
- If both a delimiter and a fixed-width layout are supplied, which wins? The old page never sends both; the old server passed both on.
