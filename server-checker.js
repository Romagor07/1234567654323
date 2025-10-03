const Gamedig = require('gamedig');
const net = require('net');
const dns = require('dns');

class ServerChecker {
    static detectGameType(port) {
        const gamePorts = {
            27015: "Garry's Mod", 27016: "Garry's Mod",
            25565: "Minecraft", 25566: "Minecraft",
            7777: "SCP:SL", 7778: "SCP:SL",
            7779: "BeamNG.drive", 7780: "Satisfactory",
            80: "Web Server", 443: "Web Server (HTTPS)",
            27005: "CS:GO", 27025: "CS:GO",
            2302: "Arma 3", 2303: "Arma 3",
            2456: "Valheim", 2457: "Valheim",
            16261: "Rust", 28015: "Rust",
            22125: "7 Days to Die", 26900: "7 Days to Die",
            3074: "Halo", 27036: "Left 4 Dead 2",
            9987: "Teamspeak", 10011: "Teamspeak",
            27500: "Unturned", 27017: "MongoDB"
        };
        return gamePorts[port] || `Порт ${port}`;
    }

    static getGameTypeByPort(port) {
        const portToGame = {
            27015: 'garrysmod', 27016: 'garrysmod',
            25565: 'minecraft', 25566: 'minecraft',
            7777: 'scpsl', 7778: 'scpsl',
            27005: 'csgo', 27025: 'csgo',
            2302: 'arma3', 2303: 'arma3',
            2456: 'valheim', 2457: 'valheim',
            16261: 'rust', 28015: 'rust',
            22125: '7d2d', 26900: '7d2d',
            7779: 'beamng', 7780: 'satisfactory',
            3074: 'halo', 27036: 'left4dead2',
            9987: 'teamspeak', 10011: 'teamspeak2',
            27500: 'unturned', 27017: 'mongodb'
        };
        return portToGame[port] || null;
    }

    static async checkServerWithGamedig(host, port) {
        try {
            const gameType = this.getGameTypeByPort(port);
            
            if (!gameType) {
                return await this.tryAutoDetectGame(host, port);
            }

            console.log(`Проверка ${host}:${port} как ${gameType}`);
            
            // Пробуем разные способы вызова Gamedig
            let result;
            
            // Способ 1: Прямой вызов (для новых версий)
            if (typeof Gamedig.query === 'function') {
                result = await Gamedig.query({
                    type: gameType,
                    host: host,
                    port: port,
                    timeout: 10000
                });
            }
            // Способ 2: Через промис (для старых версий)
            else {
                result = await new Promise((resolve, reject) => {
                    Gamedig.query({
                        type: gameType,
                        host: host,
                        port: port,
                        timeout: 10000
                    }, (error, state) => {
                        if (error) reject(error);
                        else resolve(state);
                    });
                });
            }

            // Правильное получение количества игроков
            const playersCount = result.players ? result.players.length : 0;
            const maxPlayers = result.maxplayers || 0;
            
            // Правильное получение списка игроков
            let playersList = [];
            if (result.players && Array.isArray(result.players)) {
                playersList = result.players
                    .map(player => {
                        // Обрабатываем разные форматы имен игроков
                        if (typeof player.name === 'string' && player.name.trim()) {
                            return player.name.trim();
                        } else if (player.raw && player.raw.name) {
                            return player.raw.name.toString().trim();
                        } else if (player.name) {
                            return player.name.toString().trim();
                        }
                        return null;
                    })
                    .filter(name => name && name !== '') // Убираем пустые имена
                    .slice(0, 20); // Ограничиваем список
            }

            console.log(`✅ Сервер ${host}:${port} онлайн, игроков: ${playersCount}/${maxPlayers}`);

            return {
                online: true,
                players: playersCount,
                maxPlayers: maxPlayers,
                playersList: playersList,
                gameType: this.getGameName(gameType),
                version: result.raw?.version || result.version || 'Unknown',
                map: result.map || 'Unknown',
                ping: Math.round(result.ping) || -1
            };

        } catch (error) {
            console.log(`❌ Gamedig ошибка для ${host}:${port}:`, error.message);
            return await this.fallbackCheck(host, port);
        }
    }

    static async tryAutoDetectGame(host, port) {
        const commonGames = ['garrysmod', 'minecraft', 'csgo', 'arma3', 'rust', 'valheim', 'teamspeak', 'unturned'];
        
        for (const game of commonGames) {
            try {
                console.log(`Попытка определить ${host}:${port} как ${game}`);
                
                let result;
                if (typeof Gamedig.query === 'function') {
                    result = await Gamedig.query({
                        type: game,
                        host: host,
                        port: port,
                        timeout: 5000
                    });
                } else {
                    result = await new Promise((resolve, reject) => {
                        Gamedig.query({
                            type: game,
                            host: host,
                            port: port,
                            timeout: 5000
                        }, (error, state) => {
                            if (error) reject(error);
                            else resolve(state);
                        });
                    });
                }

                const playersCount = result.players ? result.players.length : 0;
                const maxPlayers = result.maxplayers || 0;
                
                let playersList = [];
                if (result.players && Array.isArray(result.players)) {
                    playersList = result.players
                        .map(player => {
                            if (typeof player.name === 'string' && player.name.trim()) {
                                return player.name.trim();
                            } else if (player.raw && player.raw.name) {
                                return player.raw.name.toString().trim();
                            }
                            return null;
                        })
                        .filter(name => name && name !== '')
                        .slice(0, 20);
                }

                console.log(`✅ Успешно определен как ${game}, игроков: ${playersCount}/${maxPlayers}`);
                
                return {
                    online: true,
                    players: playersCount,
                    maxPlayers: maxPlayers,
                    playersList: playersList,
                    gameType: this.getGameName(game),
                    version: result.raw?.version || result.version || 'Unknown',
                    map: result.map || 'Unknown',
                    ping: Math.round(result.ping) || -1
                };
            } catch (error) {
                console.log(`❌ Не удалось определить как ${game}:`, error.message);
                continue;
            }
        }
        
        console.log(`❌ Не удалось определить тип игры для ${host}:${port}`);
        return await this.fallbackCheck(host, port);
    }

    static async fallbackCheck(host, port) {
        console.log(`🔄 Базовая TCP проверка для ${host}:${port}`);
        
        return new Promise((resolve) => {
            const socket = new net.Socket();
            const timeout = setTimeout(() => {
                socket.destroy();
                resolve({
                    online: false,
                    players: 0,
                    maxPlayers: 0,
                    playersList: [],
                    gameType: this.detectGameType(port),
                    ping: -1,
                    map: 'Unknown',
                    version: 'Unknown'
                });
            }, 8000);

            socket.on('connect', () => {
                clearTimeout(timeout);
                socket.destroy();
                resolve({
                    online: true,
                    players: 0,
                    maxPlayers: 0,
                    playersList: [],
                    gameType: this.detectGameType(port),
                    ping: -1,
                    map: 'Unknown',
                    version: 'Unknown'
                });
            });

            socket.on('error', () => {
                clearTimeout(timeout);
                resolve({
                    online: false,
                    players: 0,
                    maxPlayers: 0,
                    playersList: [],
                    gameType: this.detectGameType(port),
                    ping: -1,
                    map: 'Unknown',
                    version: 'Unknown'
                });
            });

            socket.connect(port, host);
        });
    }

    static getGameName(gameType) {
        const gameNames = {
            'garrysmod': "Garry's Mod",
            'minecraft': "Minecraft",
            'scpsl': "SCP: Secret Laboratory",
            'csgo': "Counter-Strike: Global Offensive",
            'arma3': "Arma 3",
            'valheim': "Valheim",
            'rust': "Rust",
            '7d2d': "7 Days to Die",
            'beamng': "BeamNG.drive",
            'satisfactory': "Satisfactory",
            'left4dead2': "Left 4 Dead 2",
            'teamspeak': "TeamSpeak 3",
            'teamspeak2': "TeamSpeak 2",
            'unturned': "Unturned",
            'halo': "Halo",
            'mongodb': "MongoDB"
        };
        return gameNames[gameType] || gameType;
    }

    static async checkServerStatus(serverData) {
        const startTime = Date.now();

        try {
            const host = await new Promise((resolve) => {
                dns.lookup(serverData.ip, (err, address) => {
                    if (err) resolve(serverData.ip);
                    else resolve(address);
                });
            });

            const timestamp = new Date().toLocaleTimeString('ru-RU');
            const serverInfo = await this.checkServerWithGamedig(host, serverData.port);

            return {
                online: serverInfo.online,
                ping: serverInfo.ping,
                players: serverInfo.players,
                maxPlayers: serverInfo.maxPlayers,
                playerList: serverInfo.playersList,
                timestamp: timestamp,
                gameType: serverInfo.gameType,
                responseTime: Date.now() - startTime,
                host: host,
                map: serverInfo.map,
                version: serverInfo.version
            };

        } catch (error) {
            console.error('❌ Ошибка проверки сервера:', error);
            return {
                online: false,
                ping: -1,
                players: 0,
                maxPlayers: 0,
                playerList: [],
                timestamp: new Date().toLocaleTimeString('ru-RU'),
                gameType: this.detectGameType(serverData.port),
                responseTime: Date.now() - startTime,
                error: error.message,
                map: 'Unknown',
                version: 'Unknown'
            };
        }
    }
}

module.exports = ServerChecker;