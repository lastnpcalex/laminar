# Lighthugger NASA Public-Domain Audio Provenance

All Lighthugger audio stems and impulse responses are derived from verified
Public Domain U.S. Government works (`PD-USGov-NASA`) hosted on Wikimedia Commons
and transformed offline via Python 3.12 (`numpy`, `scipy`, `librosa`, `soundfile`) + FFmpeg.

## Source Recordings

| Key | File / Instrument | Credit | License | Commons URL |
| --- | --- | --- | --- | --- |
| `saturn_rpws_1` | File:Saturn sound.ogg (Cassini RPWS Saturn auroral radio emissions (sample 1)) | NASA/JPL/University of Iowa | Public domain (PD-USGov-NASA) | https://commons.wikimedia.org/wiki/File:Saturn_sound.ogg |
| `saturn_rpws_2` | File:Saturn sound2.ogg (Cassini RPWS Saturn radio emissions PIA07966) | NASA/JPL/University of Iowa | Public domain (PD-USGov-NASA) | https://commons.wikimedia.org/wiki/File:Saturn_sound2.ogg |
| `jupiter_rpws` | File:Cassini RPWS Jupiter 010104.ogg (Cassini RPWS Jupiter bow shock and plasma waves) | NASA/JPL/University of Iowa | Public domain (PD-USGov-NASA) | https://commons.wikimedia.org/wiki/File:Cassini_RPWS_Jupiter_010104.ogg |
| `enceladus_rpws` | File:Cassini - Enceladus Sound.mp3 (Cassini RPWS plasma waves near Enceladus plume) | NASA/JPL/University of Iowa | Public domain (PD-USGov-NASA) | https://commons.wikimedia.org/wiki/File:Cassini_-_Enceladus_Sound.mp3 |
| `saturn_lightning` | File:Lightning Strikes at Saturn (PIA14310).wav (Cassini RPWS electrostatic lightning discharges at Saturn) | NASA/JPL-Caltech/University of Iowa | Public domain (PD-USGov-NASA) | https://commons.wikimedia.org/wiki/File:Lightning_Strikes_at_Saturn_(PIA14310).wav |
| `earth_chorus` | File:Chorus Radio Waves within Earth's Atmosphere.mp3 (NASA EMFISIS magnetospheric chorus plasma radio waves) | NASA/Van Allen Probes EMFISIS | Public domain (PD-USGov-NASA) | https://commons.wikimedia.org/wiki/File:Chorus_Radio_Waves_within_Earth%27s_Atmosphere.mp3 |
| `perseverance_cruise` | File:Perseverance Rover's Interplanetary Sound.oga (Perseverance internal heat-rejection fluid pump during interplanetary cruise) | NASA/JPL-Caltech/DPA | Public domain (PD-USGov-NASA) | https://commons.wikimedia.org/wiki/File:Perseverance_Rover%27s_Interplanetary_Sound.oga |
| `perseverance_mars` | File:NASA's Perseverance Rover Microphone Captures Sounds from Mars.ogg (Perseverance Mars EDL microphone capture (Martian breeze and mechanical hum)) | NASA/JPL-Caltech | Public domain (PD-USGov-NASA) | https://commons.wikimedia.org/wiki/File:NASA%27s_Perseverance_Rover_Microphone_Captures_Sounds_from_Mars.ogg |
| `perseverance_laser` | File:First acoustic recording of laser shots on Mars.oga (Perseverance SuperCam laser ablation acoustic pulses on Mars) | NASA/JPL-Caltech/LANL/CNES/CNRS/ISAE-Supaero | Public domain (PD-USGov-NASA) | https://commons.wikimedia.org/wiki/File:First_acoustic_recording_of_laser_shots_on_Mars.oga |
| `insight_seismic` | File:07-Mars sound1a 20s x100.wav (InSight Mars seismometer/pressure sensor low-frequency rumble) | NASA/JPL-Caltech | Public domain (PD-USGov-NASA) | https://commons.wikimedia.org/wiki/File:07-Mars_sound1a_20s_x100.wav |
| `sls_fire` | File:SLS Test Fire.mp3 (NASA Space Launch System booster static test fire) | NASA | Public domain (PD-USGov-NASA) | https://commons.wikimedia.org/wiki/File:SLS_Test_Fire.mp3 |
| `quindar_1` | File:Quindar - Sound (1).mp3 (NASA Apollo/Gemini Quindar mission radio tone 1) | NASA | Public domain (PD-USGov-NASA) | https://commons.wikimedia.org/wiki/File:Quindar_-_Sound_(1).mp3 |
| `quindar_2` | File:Quindar - Sound (2).mp3 (NASA Apollo/Gemini Quindar mission radio tone 2) | NASA | Public domain (PD-USGov-NASA) | https://commons.wikimedia.org/wiki/File:Quindar_-_Sound_(2).mp3 |

## Derived Browser Stems (`stems/`)

| Stem ID | File | Kind | Size (bytes) | Source Keys |
| --- | --- | --- | --- | --- |
| `music-orbital` | `stems/music-orbital.mp3` | `music` | 323565 | `sls_fire`, `saturn_rpws_1`, `perseverance_cruise` (Original D Dorian 4-chord analog & Rhodes synthesis convolved with NASA ir-hull) |
| `music-interstellar` | `stems/music-interstellar.mp3` | `music` | 323565 | `sls_fire`, `saturn_rpws_1`, `perseverance_cruise` (Original A Lydian 4-chord analog & glass-swell synthesis convolved with NASA ir-hull) |
| `music-combat` | `stems/music-combat.mp3` | `music` | 243645 | `sls_fire`, `perseverance_laser`, `saturn_rpws_1` (Original 120 BPM D Phrygian tactical bass/brass + NASA percussion convolved with NASA ir-hull) |
| `bed-cabin` | `stems/bed-cabin.mp3` | `loop` | 148365 | `perseverance_cruise`, `insight_seismic` |
| `bed-planetary` | `stems/bed-planetary.mp3` | `loop` | 172269 | `saturn_rpws_2`, `saturn_rpws_1` |
| `bed-interstellar` | `stems/bed-interstellar.mp3` | `loop` | 172269 | `jupiter_rpws`, `earth_chorus` |
| `bed-sheath` | `stems/bed-sheath.mp3` | `loop` | 124461 | `earth_chorus`, `enceladus_rpws` |
| `stem-drive` | `stems/stem-drive.mp3` | `loop` | 124461 | `sls_fire`, `perseverance_cruise`, `saturn_rpws_1` |
| `stem-rcs` | `stems/stem-rcs.mp3` | `loop` | 76365 | `sls_fire`, `perseverance_mars` |
| `stem-harvest` | `stems/stem-harvest.mp3` | `loop` | 100269 | `perseverance_cruise`, `enceladus_rpws` |
| `ir-hull` | `stems/ir-hull.wav` | `ir` | 192044 | `sls_fire`, `saturn_rpws_1`, `perseverance_cruise` |
| `sfx-quindar-in` | `stems/sfx-quindar-in.mp3` | `sfx` | 3501 | `quindar_1` |
| `sfx-quindar-out` | `stems/sfx-quindar-out.mp3` | `sfx` | 3501 | `quindar_2` |
| `sfx-wpn-newtonian` | `stems/sfx-wpn-newtonian.mp3` | `sfx` | 9837 | `perseverance_laser`, `sls_fire` |
| `sfx-wpn-relativistic` | `stems/sfx-wpn-relativistic.mp3` | `sfx` | 17037 | `perseverance_laser`, `saturn_lightning`, `sls_fire` |
| `sfx-dock-clunk` | `stems/sfx-dock-clunk.mp3` | `sfx` | 12141 | `sls_fire`, `insight_seismic`, `enceladus_rpws` |
| `sfx-impact` | `stems/sfx-impact.mp3` | `sfx` | 14445 | `saturn_lightning`, `sls_fire` |
| `sfx-explosion` | `stems/sfx-explosion.mp3` | `sfx` | 21645 | `sls_fire`, `saturn_lightning`, `insight_seismic` |
| `sfx-ui-click` | `stems/sfx-ui-click.mp3` | `sfx` | 1485 | `perseverance_laser` |
| `sfx-ui-toggle` | `stems/sfx-ui-toggle.mp3` | `sfx` | 2061 | `perseverance_laser`, `quindar_1` |
| `sfx-ui-tab` | `stems/sfx-ui-tab.mp3` | `sfx` | 2349 | `quindar_1`, `perseverance_laser` |
| `sfx-ui-confirm` | `stems/sfx-ui-confirm.mp3` | `sfx` | 3789 | `quindar_2`, `quindar_1`, `perseverance_laser` |
| `sfx-ui-deny` | `stems/sfx-ui-deny.mp3` | `sfx` | 3501 | `perseverance_laser`, `insight_seismic`, `quindar_2` |
| `sfx-warn-caution` | `stems/sfx-warn-caution.mp3` | `sfx` | 6381 | `quindar_1` |
| `sfx-alarm` | `stems/sfx-alarm.mp3` | `sfx` | 10989 | `quindar_2`, `earth_chorus` |

Original space music (`music-orbital.mp3` in D Dorian, `music-interstellar.mp3` in A Lydian, and
`music-combat.mp3` in 120 BPM D Phrygian) is procedurally synthesized and convolved with `ir-hull.wav`
(derived from the NASA spectra listed above).
