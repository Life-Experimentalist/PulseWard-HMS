# Versioning Policy for PulseWard Hospital Management System API

## Introduction

This document outlines the versioning policy for the PulseWard Hospital Management System API. It is essential to maintain a clear and consistent versioning strategy to ensure that all stakeholders can effectively manage changes and updates to the API.

## Versioning Scheme

The PulseWard API follows [Semantic Versioning](https://semver.org/) (SemVer) principles, which dictate that version numbers are assigned in the format of `MAJOR.MINOR.PATCH`:

- **MAJOR** version: Incremented for incompatible API changes.
- **MINOR** version: Incremented for adding functionality in a backward-compatible manner.
- **PATCH** version: Incremented for backward-compatible bug fixes.

## Versioning Guidelines

### 1. Major Version Changes

- Major version changes indicate breaking changes that require consumers to modify their implementations.
- All major version changes must be documented in the release notes, detailing the changes and migration paths.

### 2. Minor Version Changes

- Minor version changes introduce new features or enhancements that are backward-compatible.
- New endpoints or parameters may be added, but existing functionality must remain unchanged.

### 3. Patch Version Changes

- Patch version changes are reserved for bug fixes and minor improvements that do not affect the API's functionality.
- These changes should be communicated to consumers, but they do not require any action on their part.

## Deprecation Policy

- When an API endpoint or feature is deprecated, it will be marked as such in the documentation.
- Deprecation will be announced at least one major version prior to removal.
- A clear timeline for removal will be provided, allowing consumers to transition to alternative solutions.

## Versioning in API Requests

- The API version should be included in the request URL as follows:
  ```
  /api/v{version}/resource
  ```
- For example, to access version 1 of the patient service:
  ```
  /api/v1/patients
  ```

## Communication of Changes

- All changes to the API, including version updates, will be communicated through:
  - Release notes published in the documentation.
  - Notifications sent to registered API consumers via email or other communication channels.

## Current Release Track

- Current stable release: 1.3.0
- Current API base path: /api/v1
- Minor and patch releases keep the URL path at v1 unless a breaking change is introduced.
- Versioned release notes location: `docs/releases/`

## Conclusion

Adhering to this versioning policy will help ensure that the PulseWard Hospital Management System API remains stable, reliable, and easy to use for all stakeholders. Regular reviews of this policy will be conducted to ensure its effectiveness and relevance.
