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
Container(spacer2, "", "", "")
Container_Ext(client2, "Browser Client 2", "Web Browser", "Client application")

System_Boundary(system, "Game System") {
    Container(userService, "User Service", "Service", "Handles users")
    ContainerQueue(queue, "Message Queue", "Message Broker", "Asynchronous communication")
    Container(gameService, "Game Service", "Service", "Handles games")
    ContainerDb(userDb, "User DB", "SQLite", "Stores user data")
    Container(spacer1, "", "", "")
    ContainerDb(gameDb, "Game DB", "SQLite", "Stores game data")
}

Rel_D(client1, userService, "Calls", "gRPC")
Rel_D(client1, gameService, "Calls", "gRPC")

Rel_D(client2, userService, "Calls", "gRPC")
Rel_D(client2, gameService, "Calls", "gRPC")

Rel_R(userService, queue, "Publishes / consumes")
Rel_L(gameService, queue, "Publishes / consumes")

Rel_D(userService, userDb, "Reads and writes")
Rel_D(gameService, gameDb, "Reads and writes")

UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")

UpdateElementStyle(spacer1, $bgColor="transparent", $fontColor="transparent", $borderColor="transparent")
UpdateElementStyle(spacer2, $bgColor="transparent", $fontColor="transparent", $borderColor="transparent")

UpdateRelStyle(client1, userService, $offsetY="-40")
UpdateRelStyle(client1, gameService, $offsetY="-40")
UpdateRelStyle(client1, gameService, $offsetX="-40")
UpdateRelStyle(client2, gameService, $offsetY="-40")
UpdateRelStyle(client2, userService, $offsetY="-40")
UpdateRelStyle(client2, userService, $offsetX="40")
UpdateRelStyle(userService, queue, $offsetY="-10")
UpdateRelStyle(gameService, queue, $offsetY="-10")
UpdateRelStyle(userService, userDb, $offsetX="-20")
UpdateRelStyle(gameService, gameDb, $offsetX="20")

```

