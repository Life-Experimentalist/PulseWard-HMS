# Error Model Documentation for PulseWard Hospital Management System

## Overview

The error model documentation outlines the structure and format of error responses returned by the PulseWard Hospital Management System APIs. This model ensures consistency across all services and provides clear information to clients when errors occur.

## Error Response Structure

All error responses from the API will follow a standard structure as outlined below:

```json
{
  "status": "error",
  "code": "ERROR_CODE",
  "message": "A descriptive error message.",
  "details": {
    "field": "The specific field that caused the error.",
    "issue": "A description of the issue with the field."
  },
  "timestamp": "2023-10-01T12:00:00Z"
}
```

### Fields Description

- **status**: A string indicating the status of the response. This will always be "error" for error responses.
- **code**: A unique error code that identifies the type of error. This code can be used for programmatic error handling.
- **message**: A human-readable message that describes the error. This message should be clear and concise.
- **details**: An optional object that provides additional context about the error. This can include:
  - **field**: The specific input field that caused the error, if applicable.
  - **issue**: A description of the issue related to the field.
- **timestamp**: The time at which the error occurred, formatted in ISO 8601.

## Common Error Codes

| Code  | Message               | Description                                               |
| ----- | --------------------- | --------------------------------------------------------- |
| `400` | Bad Request           | The request was invalid or cannot be processed.           |
| `401` | Unauthorized          | Authentication failed or user does not have access.       |
| `403` | Forbidden             | The user does not have permission to access the resource. |
| `404` | Not Found             | The requested resource could not be found.                |
| `500` | Internal Server Error | An unexpected error occurred on the server.               |

## Example Error Response

Here is an example of an error response for a failed authentication attempt:

```json
{
  "status": "error",
  "code": "401",
  "message": "Unauthorized",
  "details": {
    "field": "token",
    "issue": "The provided authentication token is invalid."
  },
  "timestamp": "2023-10-01T12:00:00Z"
}
```

## Conclusion

This error model documentation serves as a guideline for developers to implement consistent error handling across the PulseWard Hospital Management System APIs. By adhering to this model, we can ensure that clients receive clear and actionable error messages, improving the overall user experience.
