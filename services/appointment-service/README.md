# Appointment Service Documentation

## Overview

The **Appointment Service** is a crucial component of the PulseWard Hospital Management System (HMS). It is responsible for managing patient appointments, including scheduling, rescheduling, and canceling appointments. This service interacts with other services within the PulseWard HMS ecosystem to ensure a seamless experience for patients and healthcare providers.

## Features

- **Schedule Appointments**: Allows patients to book appointments with healthcare providers.
- **Reschedule Appointments**: Enables patients to change their existing appointments.
- **Cancel Appointments**: Provides functionality for patients to cancel their appointments.
- **Appointment Reminders**: Sends notifications to patients about upcoming appointments.
- **Integration with Patient Records**: Links appointments with patient health records for easy access by healthcare providers.

## API Endpoints

### 1. Schedule Appointment

- **Endpoint**: `POST /appointments`
- **Description**: Schedules a new appointment for a patient.
- **Request Body**:
  ```json
  {
    "patientId": "string",
    "doctorId": "string",
    "appointmentDate": "string",
    "reason": "string"
  }
  ```
- **Response**:
  - **201 Created**: Appointment successfully scheduled.
  - **400 Bad Request**: Invalid input data.

### 2. Reschedule Appointment

- **Endpoint**: `PUT /appointments/{appointmentId}`
- **Description**: Reschedules an existing appointment.
- **Request Body**:
  ```json
  {
    "appointmentDate": "string"
  }
  ```
- **Response**:
  - **200 OK**: Appointment successfully rescheduled.
  - **404 Not Found**: Appointment not found.

### 3. Cancel Appointment

- **Endpoint**: `DELETE /appointments/{appointmentId}`
- **Description**: Cancels an existing appointment.
- **Response**:
  - **204 No Content**: Appointment successfully canceled.
  - **404 Not Found**: Appointment not found.

### 4. Get Appointment Details

- **Endpoint**: `GET /appointments/{appointmentId}`
- **Description**: Retrieves details of a specific appointment.
- **Response**:
  - **200 OK**: Appointment details returned.
  - **404 Not Found**: Appointment not found.

## Development

### Technology Stack

- **Programming Language**: TypeScript
- **Framework**: Node.js with Express
- **Database**: MongoDB (or any other preferred database)
- **Testing**: Jest for unit and integration tests

### Setup Instructions

1. Clone the repository:

   ```bash
   git clone https://github.com/Life-Experimentalist/PulseWard-HMS.git
   cd PulseWard-HMS/services/appointment-service
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the service:
   ```bash
   npm start
   ```

## Testing

To run the tests for the Appointment Service, use the following command:

```bash
npm test
```

## Documentation

For comprehensive documentation on the entire PulseWard HMS, refer to the [main README](../../README.md).

## Contribution

Contributions to the Appointment Service are welcome! Please follow the contribution guidelines outlined in the main repository.

## License

This project is proprietary and confidential. All rights reserved. See the LICENSE.md file for internal licensing terms.
