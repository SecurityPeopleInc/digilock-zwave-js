# WebSocket API Documentation

This document describes all available WebSocket commands for the Z-Wave Controller middleware application.

## Table of Contents

- [Connection](#connection)
- [Message Format](#message-format)
- [Request Commands](#request-commands)
  - [Driver Control](#driver-control)
  - [Provisioning Entries](#provisioning-entries)
  - [Nodes](#nodes)
  - [Status](#status)
  - [Manufacturer Proprietary](#manufacturer-proprietary)
  - [Health Check](#health-check)
- [Response Types](#response-types)
- [Event Types](#event-types)
- [Error Handling](#error-handling)
- [Examples](#examples)

## Connection

The WebSocket server is attached to the HTTP server and accepts connections on the same port. **The WebSocket server is available immediately when the HTTP server starts, even before the Z-Wave driver is initialized.** This allows clients to connect and send the `START` command to initialize the driver.

When a client connects, it receives a welcome message:

```json
{
  "type": "CONNECTED",
  "message": "Connected to Z-Wave middleware",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

If the driver is already started and ready, clients also receive:

```json
{
  "type": "DRIVER_READY",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Note**: If the driver is not yet started, clients should send the `START` command to initialize it. After a successful start, a `DRIVER_READY` event will be broadcast to all connected clients.

## Message Format

All messages sent to the server must be JSON objects with the following structure:

```json
{
  "type": "COMMAND_TYPE",
  "requestId": "unique-request-id",
  "data": { /* command-specific data */ }
}
```

### Required Fields

- **type** (string, required): The command type (e.g., `"GET_NODES"`, `"ADD_PROVISIONING_ENTRY"`)
- **requestId** (string, optional but recommended): A unique identifier for correlating requests with responses. If not provided, responses may not include the requestId.

### Optional Fields

- **data** (object, optional): Command-specific parameters. Some commands accept parameters directly at the root level instead of in a `data` field.

## Request Commands

### Provisioning Entries

#### GET_PROVISIONING_ENTRIES

Retrieves all SmartStart provisioning entries from the controller.

**Request:**
```json
{
  "type": "GET_PROVISIONING_ENTRIES",
  "requestId": "req-001"
}
```

**Response:**
```json
{
  "type": "PROVISIONING_ENTRIES",
  "requestId": "req-001",
  "data": [
    {
      "dsk": "44254-06861-29292-15733-32592-57065-47196-10214",
      "name": "LOCK",
      "location": "LEO",
      "status": true,
      "protocol": "ZWaveLongRange",
      "nodeId": 258,
      "securityClasses": {
        "s2AccessControl": true,
        "s2Authenticated": true,
        "s2Unauthenticated": true,
        "s0Legacy": true
      },
      "supportedProtocols": [],
      "manufacturerId": 123,
      "productType": 456,
      "productId": 789,
      "applicationVersion": "1.0.0",
      "deviceInfo": {
        "id": 258,
        "name": "LOCK",
        "status": "Alive",
        "deviceConfig": {
          "manufacturer": "Manufacturer Name",
          "label": "Device Label",
          "description": "Device Description"
        }
      }
    }
  ],
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Error Response:**
```json
{
  "type": "ERROR",
  "requestId": "req-001",
  "message": "Driver not ready"
}
```

---

#### GET_PROVISIONING_ENTRY

Retrieves a specific provisioning entry by DSK.

**Request:**
```json
{
  "type": "GET_PROVISIONING_ENTRY",
  "requestId": "req-002",
  "dsk": "44254-06861-29292-15733-32592-57065-47196-10214"
}
```

**Response:**
```json
{
  "type": "PROVISIONING_ENTRY",
  "requestId": "req-002",
  "data": {
    "dsk": "44254-06861-29292-15733-32592-57065-47196-10214",
    "name": "LOCK",
    "location": "LEO",
    "status": true,
    "protocol": "ZWaveLongRange",
    "nodeId": 258,
    "securityClasses": {
      "s2AccessControl": true,
      "s2Authenticated": true,
      "s2Unauthenticated": true,
      "s0Legacy": true
    },
    "supportedProtocols": [],
    "manufacturerId": 123,
    "productType": 456,
    "productId": 789,
    "applicationVersion": "1.0.0",
    "deviceInfo": {
      "id": 258,
      "name": "LOCK",
      "status": "Alive",
      "deviceConfig": {
        "manufacturer": "Manufacturer Name",
        "label": "Device Label",
        "description": "Device Description"
      }
    }
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Error Response (Entry Not Found):**
```json
{
  "type": "ERROR",
  "requestId": "req-002",
  "message": "Entry not found"
}
```

---

#### ADD_PROVISIONING_ENTRY

Adds a new SmartStart provisioning entry to the controller.

**Request:**
```json
{
  "type": "ADD_PROVISIONING_ENTRY",
  "requestId": "req-003",
  "entry": {
    "dsk": "44254-06861-29292-15733-32592-57065-47196-10214",
    "name": "LOCK",
    "location": "LEO",
    "protocol": "ZWaveLongRange",
    "status": true,
    "s2AccessControl": true,
    "s2Authenticated": true,
    "s2Unauthenticated": true,
    "s0Legacy": false,
    "supportedProtocols": [],
    "manufacturerId": 123,
    "productType": 456,
    "productId": 789,
    "applicationVersion": "1.0.0"
  }
}
```

**Alternative Request Format (parameters at root level):**
```json
{
  "type": "ADD_PROVISIONING_ENTRY",
  "requestId": "req-003",
  "dsk": "44254-06861-29292-15733-32592-57065-47196-10214",
  "name": "LOCK",
  "location": "LEO",
  "protocol": "ZWaveLongRange",
  "status": true,
  "s2AccessControl": true,
  "s2Authenticated": true,
  "s2Unauthenticated": true,
  "s0Legacy": false
}
```

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `dsk` | string | Yes | Device-Specific Key in format `XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX` |
| `name` | string | No | Friendly name for the device (default: `""`) |
| `location` | string | No | Location description (default: `""`) |
| `protocol` | string | No | Protocol type: `"ZWave"` or `"ZWaveLongRange"` (default: `"ZWave"`) |
| `status` | boolean | No | Whether the entry is active (default: `false`) |
| `s2AccessControl` | boolean | No | Enable S2 Access Control security class (default: `false`) |
| `s2Authenticated` | boolean | No | Enable S2 Authenticated security class (default: `false`) |
| `s2Unauthenticated` | boolean | No | Enable S2 Unauthenticated security class (default: `false`) |
| `s0Legacy` | boolean | No | Enable S0 Legacy security class (default: `false`) |
| `securityClasses` | object | No | Alternative way to specify security classes (see below) |
| `supportedProtocols` | array | No | Array of supported protocols (default: `[]`) |
| `manufacturerId` | number | No | Manufacturer ID |
| `productType` | number | No | Product type |
| `productId` | number | No | Product ID |
| `applicationVersion` | string | No | Application version string |

**Security Classes Object Format:**
```json
{
  "securityClasses": {
    "s2AccessControl": true,
    "s2Authenticated": true,
    "s2Unauthenticated": false,
    "s0Legacy": false
  }
}
```

**Response:**
```json
{
  "type": "PROVISIONING_ENTRY_ADDED",
  "requestId": "req-003",
  "data": {
    "dsk": "44254-06861-29292-15733-32592-57065-47196-10214",
    "name": "LOCK",
    "location": "LEO",
    "protocol": "ZWaveLongRange",
    "status": true,
    "securityClasses": {
      "s2AccessControl": true,
      "s2Authenticated": true,
      "s2Unauthenticated": true,
      "s0Legacy": false
    },
    "supportedProtocols": [],
    "manufacturerId": 123,
    "productType": 456,
    "productId": 789,
    "applicationVersion": "1.0.0"
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Error Response:**
```json
{
  "type": "ERROR",
  "requestId": "req-003",
  "message": "DSK is required"
}
```

---

#### UPDATE_PROVISIONING_ENTRY_STATUS

Updates the active/inactive status of a provisioning entry.

**Request:**
```json
{
  "type": "UPDATE_PROVISIONING_ENTRY_STATUS",
  "requestId": "req-004",
  "dsk": "44254-06861-29292-15733-32592-57065-47196-10214",
  "active": true
}
```

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `dsk` | string | Yes | Device-Specific Key of the entry to update |
| `active` | boolean | Yes | Whether the entry should be active (`true`) or inactive (`false`) |

**Response:**
```json
{
  "type": "PROVISIONING_ENTRY_STATUS_UPDATED",
  "requestId": "req-004",
  "data": {
    "dsk": "44254-06861-29292-15733-32592-57065-47196-10214",
    "active": true
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Error Response:**
```json
{
  "type": "ERROR",
  "requestId": "req-004",
  "message": "dsk is required"
}
```

---

#### DELETE_PROVISIONING_ENTRY

Removes a provisioning entry from the controller.

**Request:**
```json
{
  "type": "DELETE_PROVISIONING_ENTRY",
  "requestId": "req-005",
  "dsk": "44254-06861-29292-15733-32592-57065-47196-10214"
}
```

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `dsk` | string | Yes | Device-Specific Key of the entry to delete |

**Response:**
```json
{
  "type": "PROVISIONING_ENTRY_DELETED",
  "requestId": "req-005",
  "data": {
    "dsk": "44254-06861-29292-15733-32592-57065-47196-10214"
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Error Response:**
```json
{
  "type": "ERROR",
  "requestId": "req-005",
  "message": "dsk is required"
}
```

---

### Nodes

#### GET_NODES

Retrieves all nodes currently in the Z-Wave network.

**Request:**
```json
{
  "type": "GET_NODES",
  "requestId": "req-006"
}
```

**Response:**
```json
{
  "type": "NODES",
  "requestId": "req-006",
  "data": [
    {
      "id": 1,
      "name": "Controller",
      "status": "Alive",
      "protocol": "ZWave",
      "location": "",
      "deviceConfig": {
        "manufacturer": "Controller Manufacturer",
        "label": "Controller Label",
        "description": "Controller Description"
      }
    },
    {
      "id": 258,
      "name": "LOCK",
      "status": "Alive",
      "protocol": "ZWaveLongRange",
      "location": "LEO",
      "deviceConfig": {
        "manufacturer": "Lock Manufacturer",
        "label": "Lock Label",
        "description": "Lock Description"
      }
    }
  ],
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Note:** If the driver is not ready, this returns an empty array instead of an error.

---

#### GET_NODE

Retrieves information about a specific node by node ID.

**Request:**
```json
{
  "type": "GET_NODE",
  "requestId": "req-007",
  "nodeId": 258
}
```

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `nodeId` | number or string | Yes | The node ID to retrieve (will be parsed as integer) |

**Response:**
```json
{
  "type": "NODE",
  "requestId": "req-007",
  "data": {
    "id": 258,
    "name": "LOCK",
    "status": "Alive",
    "protocol": "ZWaveLongRange",
    "location": "LEO",
    "deviceConfig": {
      "manufacturer": "Lock Manufacturer",
      "label": "Lock Label",
      "description": "Lock Description"
    }
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Error Response (Node Not Found):**
```json
{
  "type": "ERROR",
  "requestId": "req-007",
  "message": "Node not found"
}
```

**Error Response (Invalid Node ID):**
```json
{
  "type": "ERROR",
  "requestId": "req-007",
  "message": "Invalid nodeId"
}
```

---

### Driver Control

#### START

Starts the Z-Wave driver. The WebSocket server is ready to accept connections before the driver is started, and this command initializes the driver connection.

**Request:**
```json
{
  "type": "START",
  "requestId": "req-start-001",
  "port": "/dev/tty.usbserial-DK0E7J3D"
}
```

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `port` | string | No | Serial port path for the Z-Wave controller. If not provided, uses the default port from configuration |

**Response:**
```json
{
  "type": "START_SUCCESS",
  "requestId": "req-start-001",
  "data": {
    "port": "/dev/tty.usbserial-DK0E7J3D",
    "message": "Driver started successfully"
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Error Response (Driver Already Started):**
```json
{
  "type": "ERROR",
  "requestId": "req-start-001",
  "message": "Driver is already started"
}
```

**Error Response (Connection Failed):**
```json
{
  "type": "ERROR",
  "requestId": "req-start-001",
  "message": "Failed to start driver: [error details]"
}
```

**Notes:**
- The driver can only be started once. If already started, the command will return an error.
- After successful start, a `DRIVER_READY` event will be broadcast to all connected clients.
- The driver must be started before most other commands (except `GET_STATUS`, `PING`, and `START` itself) can be used.

---

### Status

#### GET_STATUS

Retrieves the current status of the Z-Wave driver and connection.

**Request:**
```json
{
  "type": "GET_STATUS",
  "requestId": "req-008"
}
```

**Response:**
```json
{
  "type": "STATUS",
  "requestId": "req-008",
  "data": {
    "driverReady": true,
    "port": "/dev/tty.usbserial-DK0E7J3D",
    "connected": true
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `driverReady` | boolean | Whether the Z-Wave driver is ready and initialized |
| `port` | string or null | The serial port path currently in use |
| `connected` | boolean | Whether the Z-Wave client is connected |

---

### Manufacturer Proprietary

#### SEND_COMMAND

Sends a custom Manufacturer Proprietary command with a specific payload to a node.

**Request:**
```json
{
  "type": "SEND_COMMAND",
  "requestId": "req-010",
  "nodeId": 258,
  "manufacturerId": 0x0000,
  "payloadHex": "0001020304050607080900010203040506070809000102030405060708090002",
  "count": 1
}
```

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `nodeId` | number or string | No | Target node ID (default: `2`) |
| `manufacturerId` | number or string | No | Manufacturer ID in decimal or hex format (default: `0x0000`). Can be hex string like `"0x1234"` or `"1234"` |
| `payloadHex` | string | Yes | Hex string representing exactly 32 bytes (64 hex characters) of payload data |
| `count` | number or string | No | Number of times to send the command (default: `1`) |

**Payload Format:**
- Must be exactly 32 bytes (64 hex characters)
- No spaces or separators
- Example: `"0001020304050607080900010203040506070809000102030405060708090002"`

**Response:**
```json
{
  "type": "COMMAND_RESULT",
  "requestId": "req-010",
  "data": {
    "nodeId": 258,
    "count": 1,
    "vendorPayloadHex": "0001020304050607080900010203040506070809000102030405060708090002",
    "manufacturerId": 0,
    "results": [
      {
        "success": true,
        "timestamp": "2024-01-15T10:30:00.000Z"
      }
    ]
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Error Response (Invalid Payload):**
```json
{
  "type": "ERROR",
  "requestId": "req-010",
  "message": "Invalid payloadHex format"
}
```

**Error Response (Missing Payload):**
```json
{
  "type": "ERROR",
  "requestId": "req-010",
  "message": "payloadHex is required"
}
```

---

### Health Check

#### PING

Health check command to verify the WebSocket connection is alive.

**Request:**
```json
{
  "type": "PING",
  "requestId": "req-011"
}
```

**Response:**
```json
{
  "type": "PONG",
  "requestId": "req-011",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

## Response Types

All responses include a `requestId` field (if provided in the request) and a `timestamp` field. The response type determines the structure:

| Response Type | Description |
|--------------|-------------|
| `PROVISIONING_ENTRIES` | Array of provisioning entries |
| `PROVISIONING_ENTRY` | Single provisioning entry |
| `PROVISIONING_ENTRY_ADDED` | Confirmation of added entry |
| `PROVISIONING_ENTRY_STATUS_UPDATED` | Confirmation of status update |
| `PROVISIONING_ENTRY_DELETED` | Confirmation of deleted entry |
| `NODES` | Array of nodes |
| `NODE` | Single node information |
| `STATUS` | Driver status information |
| `START_SUCCESS` | Confirmation of driver start |
| `COMMAND_RESULT` | Result of custom MP command |
| `PONG` | Response to PING |
| `ERROR` | Error response |

---

## Event Types

The server broadcasts events to all connected clients when certain Z-Wave events occur. These events do not require a request and are sent automatically:

### DRIVER_READY

Sent when the Z-Wave driver becomes ready.

```json
{
  "type": "DRIVER_READY",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### NODE_ADDED

Sent when a new node is added to the network.

```json
{
  "type": "NODE_ADDED",
  "nodeId": 258,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### NODE_REMOVED

Sent when a node is removed from the network.

```json
{
  "type": "NODE_REMOVED",
  "nodeId": 258,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### NODE_STATUS_CHANGED

Sent when a node's status changes.

```json
{
  "type": "NODE_STATUS_CHANGED",
  "nodeId": 258,
  "status": "Alive",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### MANUFACTURER_PROPRIETARY_COMMAND

Sent when a Manufacturer Proprietary (CC 0x91) command is received from a node.

```json
{
  "type": "MANUFACTURER_PROPRIETARY_COMMAND",
  "data": {
    "manufacturerId": "unknown",
    "payloadHex": "0001020304050607080900010203040506070809000102030405060708090002",
    "payloadLength": 32,
    "endpointIndex": 0,
    "commandType": "ManufacturerProprietaryCC",
    "ccId": 145
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### COMMAND_CLASS_COMMAND

Sent when a generic command class command is received from a node.

```json
{
  "type": "COMMAND_CLASS_COMMAND",
  "data": {
    /* Command class specific data */
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### ERROR

Sent when a Z-Wave error occurs.

```json
{
  "type": "ERROR",
  "message": "Error message here",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

## Error Handling

All commands may return an error response with the following structure:

```json
{
  "type": "ERROR",
  "requestId": "req-xxx",
  "message": "Error description"
}
```

### Common Error Messages

- `"Driver not ready"` - The Z-Wave driver is not initialized or ready
- `"Message must have a 'type' field"` - Invalid message format
- `"Unknown message type: <type>"` - Unrecognized command type
- `"DSK is required"` - Missing required DSK parameter
- `"dsk is required"` - Missing required DSK parameter
- `"active must be a boolean"` - Invalid active parameter type
- `"Invalid nodeId"` - Invalid or non-numeric node ID
- `"Node not found"` - Node with specified ID does not exist
- `"Entry not found"` - Provisioning entry with specified DSK not found
- `"payloadHex is required"` - Missing required payloadHex parameter
- `"Invalid payloadHex format"` - Payload hex string is not 32 bytes (64 hex characters)

---

## Examples

### JavaScript/TypeScript Client Example

```javascript
const ws = new WebSocket('ws://localhost:3000');

ws.onopen = () => {
  console.log('Connected to WebSocket server');
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message);
  
  switch (message.type) {
    case 'CONNECTED':
      console.log('Connection established');
      // Start the driver
      sendCommand('START', {
        port: '/dev/tty.usbserial-DK0E7J3D'
      });
      break;
    case 'START_SUCCESS':
      console.log('Driver started successfully');
      break;
    case 'DRIVER_READY':
      console.log('Driver is ready');
      // Request nodes
      ws.send(JSON.stringify({
        type: 'GET_NODES',
        requestId: 'req-001'
      }));
      break;
    case 'NODES':
      console.log('Nodes:', message.data);
      break;
    case 'ERROR':
      console.error('Error:', message.message);
      break;
  }
};

// Send a command
function sendCommand(type, data = {}) {
  const requestId = `req-${Date.now()}`;
  ws.send(JSON.stringify({
    type,
    requestId,
    ...data
  }));
  return requestId;
}

// Example: Get provisioning entries
sendCommand('GET_PROVISIONING_ENTRIES');

// Example: Add provisioning entry
sendCommand('ADD_PROVISIONING_ENTRY', {
  entry: {
    dsk: '44254-06861-29292-15733-32592-57065-47196-10214',
    name: 'My Lock',
    location: 'Front Door',
    protocol: 'ZWaveLongRange',
    status: true,
    s2AccessControl: true,
    s2Authenticated: true,
    s2Unauthenticated: true,
    s0Legacy: false
  }
});

// Example: Start the driver
sendCommand('START', {
  port: '/dev/tty.usbserial-DK0E7J3D'
});

// Example: Send custom Manufacturer Proprietary command
sendCommand('SEND_COMMAND', {
  nodeId: 258,
  manufacturerId: 0x0000,
  payloadHex: '0001020304050607080900010203040506070809000102030405060708090002',
  count: 1
});
```

### Python Client Example

```python
import asyncio
import websockets
import json

async def client():
    uri = "ws://localhost:3000"
    async with websockets.connect(uri) as websocket:
        # Wait for connection message
        message = await websocket.recv()
        print(f"Received: {message}")
        
        # Start the driver
        start_request = {
            "type": "START",
            "requestId": "req-start-001",
            "port": "/dev/tty.usbserial-DK0E7J3D"
        }
        await websocket.send(json.dumps(start_request))
        
        # Receive start response
        start_response = await websocket.recv()
        start_data = json.loads(start_response)
        print(f"Start: {start_data}")
        
        # Send GET_NODES command
        request = {
            "type": "GET_NODES",
            "requestId": "req-001"
        }
        await websocket.send(json.dumps(request))
        
        # Receive response
        response = await websocket.recv()
        data = json.loads(response)
        print(f"Nodes: {data}")
        
        # Send PING
        ping = {
            "type": "PING",
            "requestId": "req-002"
        }
        await websocket.send(json.dumps(ping))
        
        # Receive PONG
        pong = await websocket.recv()
        print(f"Pong: {pong}")

asyncio.run(client())
```

### cURL Example (using wscat or similar)

```bash
# Install wscat: npm install -g wscat
wscat -c ws://localhost:3000

# Then send commands:
{"type":"START","requestId":"req-start-001","port":"/dev/tty.usbserial-DK0E7J3D"}
{"type":"GET_NODES","requestId":"req-001"}
{"type":"GET_STATUS","requestId":"req-002"}
{"type":"PING","requestId":"req-003"}
```

---

## Notes

1. **Request IDs**: While optional, it's highly recommended to include a unique `requestId` in each request to correlate responses, especially when multiple requests are sent concurrently.

2. **Driver Ready State**: The WebSocket server is ready to accept connections immediately, but the Z-Wave driver must be started using the `START` command before most other commands can be used. Commands that work without the driver started include: `GET_STATUS`, `PING`, and `START` itself. Use `GET_STATUS` to check the driver state before sending commands that require it.

3. **Starting the Driver**: The `START` command initializes the Z-Wave driver connection. After a successful start, a `DRIVER_READY` event will be broadcast to all connected clients. The driver can only be started once per session.

4. **Manufacturer Proprietary Commands**: The payload for `SEND_COMMAND` must be exactly 32 bytes (64 hex characters). The system will validate this format.

5. **Security Classes**: When adding provisioning entries, you can specify security classes either as individual boolean fields (`s2AccessControl`, `s2Authenticated`, etc.) or as a `securityClasses` object.

6. **Protocol Types**: Supported protocol values are:
   - `"ZWave"` - Standard Z-Wave
   - `"ZWaveLongRange"` or `"Z-Wave Long Range"` - Z-Wave Long Range

7. **Node Status Values**: Common node status values include:
   - `"Alive"` - Node is active and responding
   - `"Asleep"` - Node is sleeping
   - `"Dead"` - Node is not responding
   - `"Unknown"` - Status unknown

8. **Event Broadcasting**: All events are broadcast to all connected clients. There's no way to subscribe/unsubscribe to specific events - all clients receive all events.

9. **Connection Management**: Clients should handle reconnection logic if the connection is lost. The server will send a `CONNECTED` message on each new connection. The WebSocket server is available immediately when the HTTP server starts, even before the Z-Wave driver is initialized.

---

## Version Information

This documentation corresponds to the WebSocket API implementation in:
- File: `Digilock/src/plugins/ZWaveControllerWebsocket.js`
- Last Updated: 2024-01-15

