# PulseWard - Shared Utilities

Welcome to the **PulseWard** shared utilities package! This package contains a collection of utility functions and helpers that are used across various applications and services within the PulseWard Hospital Management System.

## Overview

The shared utilities package aims to provide reusable code that can simplify common tasks and enhance code maintainability. By centralizing utility functions, we ensure consistency and reduce code duplication across the project.

## Installation

To install the shared utilities package, you can use the following command:

```bash
npm install @pulseward/shared-utils
```

## Usage

To use the utilities in your application, import the required functions as follows:

```javascript
import { utilityFunction } from "@pulseward/shared-utils";

// Example usage
utilityFunction();
```

## Available Utilities

### 1. String Utilities

- `capitalize`: Capitalizes the first letter of a string.
- `truncate`: Truncates a string to a specified length.

### 2. Array Utilities

- `unique`: Returns an array of unique values from the input array.
- `flatten`: Flattens a nested array into a single array.

### 3. Date Utilities

- `formatDate`: Formats a date object into a readable string.
- `isPast`: Checks if a given date is in the past.

### 4. Validation Utilities

- `isEmail`: Validates if a string is a valid email format.
- `isPhoneNumber`: Validates if a string is a valid phone number format.

## Contribution

We welcome contributions to the shared utilities package! If you have a utility function that you think would be beneficial for the project, please submit a pull request.

## License

This project is proprietary and confidential. All rights reserved. See the LICENSE.md file for internal licensing terms.

---

For more information, please refer to the main project documentation or contact the development team. Happy coding!
