/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { createContext, useContext, ReactNode, useRef, useEffect, useState, useCallback } from "react"
import PropTypes from "prop-types"

import ReconnectingWebSocket from "reconnecting-websocket"
import { PingWS, filterPingPongMessages } from "@cs125/pingpongws"

import { v4 as uuidv4 } from "uuid"
import queryString from "query-string"

import { ConnectionQuery, RoomsMessage, RoomID, ChitterMessage, JoinMessage, MessageContents } from "../types"

import { String } from "runtypes"
const VERSION = String.check(process.env.npm_package_version)
const COMMIT = String.check(process.env.GIT_COMMIT)

// Type and create our context that will be passed to consumers lower in the component tree
// TODO: Add things here as needed, including callbacks allowing components to send messagse
export interface ChitterContext {
  connected: boolean
  rooms: RoomID[]
  join: (room: RoomID, onReceive: (message: ChitterMessage) => void) => void
  messages: Record<RoomID, ChitterMessage[]>
  sendMessage: (room: RoomID, contents: MessageContents, onReceive: (message: ChitterMessage) => void) => void
  clientID: string
}

// Context provider component that will wrap the entire app.
// Responsible for establishing the websocket connection and providing ways for
// context subscribers to join rooms and send and receive messages
export interface ChitterProviderProps {
  server: string
  children: ReactNode // Can wrap itself around another react component
}

// State only gets used once
export const ChitterProvider: React.FC<ChitterProviderProps> = ({ server, children }) => {
  // UniqueID that identifies this client. Saved in sessionStorage to be stable across refreshes,
  // but not in localStorage to allow different rooms for each tab
  // Need to make sure that we don't fetch this during SSR...
  const clientID = useRef<string>((typeof window !== "undefined" && sessionStorage.getItem("chitter:id")) || uuidv4())

  // Use ref is a way to set up a "private variable". This useRef will only be established on initial render, and it is not reassigned if the component re-renders.

  // State that we will pass to context subscribers
  // Usually there is a one-to-one mapping between parts of the context object and state
  // on the context provider
  const [connected, setConnected] = useState(false)
  const [rooms, setRooms] = useState<RoomID[]>([])
  const [messages, setMessages] = useState<Record<RoomID, ChitterMessage[]>>({})

  // Set up the websocket connection
  const connection = useRef<ReconnectingWebSocket | undefined>(undefined)

  // The code inside here will run once when the component mounts, and again when the server variable changes.
  useEffect(() => {
    sessionStorage.setItem("chitter:id", clientID.current)
    // useEffect runs after the initial render, and (in this case) any time the server configuration changes
    connection.current?.close() // UseRef gives back a current property, (? is optional property syntax like in Kotlin)
    // Close any existing connections before we go forward.

    // Sending three pieces of information to the server (cannot send header through web socket)
    // We know the Client ID, and the version information.
    const connectionQuery = ConnectionQuery.check({
      clientID: clientID.current,
      version: VERSION,
      commit: COMMIT,
    })

    // Set up the websocket connection.
    // PingWS made my Geoff to help keep the socket connection healthy.
    // ReconnectingWebSocket is a component that will try to reconnect if the connection has appeared to have died.
    connection.current = PingWS(
      new ReconnectingWebSocket(`${server}?${queryString.stringify(connectionQuery)}`, [], { startClosed: true })
    )

    // Set up listeners to pass the connection state to context subscribers
    // Note that the ReconnectingWebsocket and our PingPong wrapper will
    // send keep-alive messages and attempt to reconnect across disconnections
    // That keeps our code fairly simple
    connection.current.addEventListener("open", () => {
      setConnected(true)
    })
    connection.current.addEventListener("close", () => {
      setConnected(false)
    })

    // Messages event listener. This is what gets called when messages arrive from the server.
    connection.current.addEventListener(
      "message",
      filterPingPongMessages(({ data }) => {
        // Very similar to the server-side code.
        // Handle any incoming messages that we could receive from the server.
        const message = JSON.parse(data)
        if (RoomsMessage.guard(message)) {
          setRooms(message.rooms)
        }
        else if (ChitterMessage.guard(message)) {
          // If this is a Chitter Message, we want to send this to the client.
          const messagesInRoom = messages[message.room] ? messages[message.room] : []
          messagesInRoom.unshift(message)
          const newObj = { ...messages, [message.room]: messagesInRoom }
          setMessages(newObj)
        }
      })
    )

    // This function will be called when the component is unmounted / connection is closed.
    connection.current.reconnect()
    return (): void => {
      connection.current?.close()
      connection.current = undefined
    }
  }, [server, messages]) // This is the server variable that will cause the component to re-render on change.

  const join = useCallback((room: RoomID) => {
    const joinMessage = JoinMessage.check({ type: "join", roomID: room })
    connection.current?.send(JSON.stringify(joinMessage))
  }, [])

  const sendMessage = useCallback((room: RoomID, contents: MessageContents) => {
    const message = ChitterMessage.check({
      type: "message",
      displayName: "", // We leave this empty because the server will determine this anyway
      id: uuidv4(),
      clientID: clientID.current,
      room,
      messageType: "text",
      contents,
    })
    console.log(message)
    connection.current?.send(JSON.stringify(message))
  }, [])

  // This is not a presentational component: we are returning / rendering a Context Provider.
  // Passing down the connected boolean, the rooms and the join method.
  return (
    <ChitterContext.Provider value={{ connected, rooms, messages, join, sendMessage, clientID: clientID.current }}>
      {children}
    </ChitterContext.Provider>
  )
}

ChitterProvider.propTypes = {
  server: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
}

export const useChitter = (): ChitterContext => {
  return useContext(ChitterContext)
}

// This is a default context object that we need to provide for some reason
// It should never be used by an actual subscriber
// Just set default values for fields and functions that throw for callbacks
export const ChitterContext = createContext<ChitterContext>({
  connected: false,
  rooms: [],
  messages: {},
  join: (): void => {
    throw new Error("ChitterProvider not set")
  },
  sendMessage: (): void => {
    throw new Error("ChitterProvider not set")
  },
  clientID: "",
})

export { ChitterMessage, RoomID }
