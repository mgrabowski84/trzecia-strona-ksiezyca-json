require('dotenv').config()

const SpotifyWebApi = require('spotify-web-api-node')
const fetch = require('node-fetch')
const parse = require('url-parse')
const glob = require('glob')
const fs = require('fs')
const unidecode = require('unidecode')

const scopes = ['playlist-modify-public', 'playlist-modify-private', 'playlist-read-private', 'playlist-read-collaborative', 'user-read-private', 'user-read-email']
const clientId = process.env.SPOTIFY_ID
const redirectUri = 'http://localhost/callback'
const clientSecret = process.env.SPOTIFY_SECRET

const credentials = {
  clientId: clientId,
  clientSecret: clientSecret,
  redirectUri: redirectUri
}

const spotifyApi = new SpotifyWebApi(credentials)

const getAccessToken = async () => {
  const response = await fetch(spotifyApi.createAuthorizeURL(scopes), {
    headers: {
      cookie: process.env.COOKIE
    },
    redirect: 'manual',
    method: 'GET'
  })
  const url = parse(response.headers.get('location'), true)
  return url.query.code
}

const normalize = str => {
  return unidecode(str).replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
}

const getAllPlaylistTracks = async (playlistId, offset = 0, limit = 100) => {
  const { body: { total, items } } = await spotifyApi.getPlaylistTracks(playlistId, { limit, offset })
  const tracks = items.map(({ track }) => ({
    id: track.id,
    artists: track.artists.map(artist => normalize(artist.name)),
    name: normalize(track.name)
  }))
  const nextTracks = offset + limit < total ? await getAllPlaylistTracks(playlistId, offset + limit) : []
  return [
    ...tracks,
    ...nextTracks
  ]
}

(async () => {
  const code = await getAccessToken()
  const { body: { access_token: accessToken, refresh_token: refreshToken } } = await spotifyApi.authorizationCodeGrant(code)
  spotifyApi.setAccessToken(accessToken)
  spotifyApi.setRefreshToken(refreshToken)

  const existingTracks = await getAllPlaylistTracks(process.env.PLAYLIST_ID)
  const existingIds = existingTracks.map(track => track.id)

  const files = glob.sync('json/*.json')
  const songs = files.reduce((previous, file) => {
    const data = fs.readFileSync(file, 'utf8')
    const songs = JSON.parse(data)
    return [...previous, ...songs.map(song => `artist:${song.artist} track:${song.title}`.replace("'", ''))]
  }, [])

  for (const search of songs) {
    const { body: { tracks: { items: songs } } } = await spotifyApi.searchTracks(search)
    const song = songs[0]
    if (typeof song === 'undefined') {
      console.log(`Search "${search}" did not found anything!`)
      continue
    }
    if (!existingIds.includes(song.id)) {
      if (existingTracks.find(track => track.name === normalize(song.name) && track.artists.includes(normalize(song.artists[0].name)))) {
        console.log(`Search "${search}" found "${song.name}" a duplicate!`)
        continue
      }
      await spotifyApi.addTracksToPlaylist(process.env.PLAYLIST_ID, [`spotify:track:${song.id}`])
      console.log(`Search "${search}" found "${song.name}" - added!`)
    } else {
      console.log(`Search "${search}" found "${song.name}" - already exists!`)
    }
  }
})()
