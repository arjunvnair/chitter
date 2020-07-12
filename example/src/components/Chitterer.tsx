import React, { useEffect, useState, useCallback } from "react"
import PropTypes from "prop-types"

import { v4 as uuidv4 } from "uuid"

// Note that we're already wrapped this component with a ChitterProvider in wrapRootElement.tsx
// So all we need here is the context provider and a type
import { RoomID, useChitter, ChitterMessage } from "@cs125/chitter"

// Various bits of the Material UI framework
// We try to use this style of import since it leads to smaller bundles,
// but this is just an example component so it doesn't really matter that much
import makeStyles from "@material-ui/core/styles/makeStyles"
import { P } from "@cs125/gatsby-theme-cs125/src/material-ui"
import TextField from "@material-ui/core/TextField"
import { CSSProperties } from "@material-ui/core/styles/withStyles"
import { Typography } from "@material-ui/core"

// Set up styles for the various parts of our little UI
// makeStyles allows us to use the passed theme as needed, which we don't do here (yet)

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const useStyles = makeStyles(_ => ({
  chitterer: {
    width: "100%",
    border: "1px solid grey",
    padding: 8,
  },
  messages: {
    display: "flex",
    flexDirection: "column-reverse",
    maxHeight: 128,
    overflowY: "scroll",
  },
  message: {
    flex: 1,
  },
  input: {
    width: "100%",
  },
}))

export interface ChittererProps {
  room: RoomID
  style: CSSProperties
}
export const Chitterer: React.FC<ChittererProps> = ({ room, ...props }) => {
  // This exposes two pieces of state: connected boolean (connection to backend server) and a function (join) which gets called when the component starts up.
  // This is where the component subscribes to the context provider.
  const { connected, join, sendMessage, messages, clientID } = useChitter()
  const classes = useStyles()

  // useEffect hooks run after the initial render and then whenever their dependencies change
  // Here we join the room this component is configured to connect to
  // So far the callback we register just appends new messages to our array, which seems reasonable
  // but is something we may need to update later
  useEffect(() => {
    // This join function is from the above useChitterer()
    if (connected) {
      join(room, message => {
        console.log(message)
      })
    }
  }, [connected, join, room]) // Any time any of these dependencies change, the component will re-render

  // Callbacks for our input element below
  // You can define these right on the element itself, but then they are recreated on every render
  // So using the useCallback hook is slightly more efficient, and maybe a bit clearer

  const [input, setInput] = useState("")

  // We control the value of the input box, so each time it changes we need to update our copy
  const onChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setInput(event.target.value)
  }, [])

  // We want enter to trigger sending the message, but also want to allow Control-Enter to advance
  // to the next line
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>, contents: string) => {
      if (event.key == "Enter") {
        if (!event.ctrlKey) {
          const auth2 = window.gapi.auth2.getAuthInstance()

          if (auth2.isSignedIn.get()) {
            // We can only send messages if the user is signed in
            const profile = auth2.currentUser.get().getBasicProfile()
            console.log("ID: " + profile.getId())
            console.log("Full Name: " + profile.getName())
            console.log("Given Name: " + profile.getGivenName())
            console.log("Family Name: " + profile.getFamilyName())
            console.log("Image URL: " + profile.getImageUrl())
            console.log("Email: " + profile.getEmail())

            const googleIDToken: string = auth2.currentUser.get().getAuthResponse().id_token

            sendMessage(room, contents, googleIDToken, () => {
              return null
            })
            setInput("")
            console.log(clientID)
          } else {
            // If the user is not signed in, do not send the message and inform them
            throw new Error("Please sign in to send messages.") // TODO: Create a popup box or some other GUI indicator
          }
        } else {
          setInput(i => i + "\n")
        }
        // Prevent the default event from bubbling upward
        event.preventDefault()
      }
    },
    [room, sendMessage, clientID]
  )

  return (
    <div className={classes.chitterer} {...props}>
      <div className={classes.messages}>
        {messages[room]?.map((message, i) => (
          <div key={i} className={classes.message}>
            <Typography paragraph={true} align={clientID == message.clientID ? "left" : "right"}>
              <b>{message.displayName}</b>: {message.contents}
            </Typography>
          </div>
        ))}
      </div>
      <TextField
        value={input}
        className={classes.input}
        placeholder="Send"
        multiline
        onChange={onChange}
        onKeyDown={e => onKeyDown(e, input)}
      />
    </div>
  )
}

Chitterer.propTypes = {
  room: PropTypes.string.isRequired,
}
