<!-- LTeX: language=en-US -->
# Goals
This design document is intended to document our decisions regarding the architecture of this project.

It should clearly define:
1. The services we are planning to develop
2. Protocols used for communication between given services

# Non Goals
This document won't define the interface between the services. It will only define the technologies we use. The interface can onlybe defined once this document has been approved.

# Design that was discussed in our first meeting:

```mermaid
C4Container

Container_Ext(client1, "Browser Client 1", "Web Browser", "Client application")
Container_Ext(client2, "Browser Client 2", "Web Browser", "Client application")

System_Boundary(system, "Backend") {
    Container(userService, "User Service", "Service", "Handles user logic")
    Container(gameService, "Game Service", "Service", "Handles game logic")

    ContainerQueue(queue, "Message Queue", "Message Broker")

    ContainerDb(userDb, "User DB", "SQLite", "Stores user data")
    ContainerDb(gameDb, "Game DB", "SQLite", "Stores game data")
}

Rel(client1, userService, "Calls", "gRPC")
Rel(client1, gameService, "Calls", "gRPC")

Rel(client2, userService, "Calls", "gRPC")
Rel(client2, gameService, "Calls", "gRPC")

Rel(userService, queue, "Publishes / consumes messages")
Rel(gameService, queue, "Publishes / consumes messages")

Rel(userService, userDb, "Reads and writes")
Rel(gameService, gameDb, "Reads and writes")
```
