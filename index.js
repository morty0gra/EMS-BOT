const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { createCanvas, loadImage, registerFont } = require('canvas');

// ================= USTAWIENIA =================
const BOT_TOKEN = process.env.BOT_TOKEN; 
const PORT = process.env.PORT || 3000;
// ==============================================

// Wczytanie czcionki odręcznej z pliku font.ttf
if (fs.existsSync('./font.ttf')) {
    registerFont('./font.ttf', { family: 'RecznePismo' });
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const app = express();

app.use(cors());
app.use(express.json());

// Baza danych kanałów
const CONFIG_FILE = './config.json';
let channelsConfig = { podania: null, wyniki: null, aktZgonu: null };
if (fs.existsSync(CONFIG_FILE)) {
    channelsConfig = JSON.parse(fs.readFileSync(CONFIG_FILE));
} else {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(channelsConfig));
}

// Baza danych kont
const KONTA_FILE = './konta.json';
let kontaConfig = {};
if (fs.existsSync(KONTA_FILE)) {
    kontaConfig = JSON.parse(fs.readFileSync(KONTA_FILE));
} else {
    kontaConfig = { "Zarzad": "EMS123" }; 
    fs.writeFileSync(KONTA_FILE, JSON.stringify(kontaConfig));
}

// --- API 1: PODAŃ ---
app.post('/api/apply', async (req, res) => {
    try {
        if (!channelsConfig.podania) return res.status(400).send({ error: 'Brak kanału podań!' });
        const hrChannel = await client.channels.fetch(channelsConfig.podania);
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`accept_${req.body.discordNick}`).setLabel('ZAAKCEPTUJ').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`reject_${req.body.discordNick}`).setLabel('ODRZUĆ').setStyle(ButtonStyle.Danger),
        );
        await hrChannel.send({ embeds: req.body.embeds, components: [row] });
        res.status(200).send({ message: 'Wysłano' });
    } catch (e) { 
        console.error(e);
        res.status(500).send({ error: 'Błąd serwera' }); 
    }
});

// --- API 2: LOGOWANIE ---
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (kontaConfig[username] && kontaConfig[username] === password) {
        res.status(200).send({ success: true });
    } else {
        res.status(401).send({ success: false });
    }
});

// --- API 3: AKT ZGONU (GENERATOR PNG) ---
app.post('/api/akt-zgonu', async (req, res) => {
    try {
        if (!channelsConfig.aktZgonu) return res.status(400).send({ error: 'Brak kanału!' });
        
        const data = req.body;
        
        const baseImage = await loadImage('./akt_base.png');
        const stampImage = await loadImage('./stamp.png');
        
        const canvas = createCanvas(baseImage.width, baseImage.height);
        const ctx = canvas.getContext('2d');
        
        ctx.drawImage(baseImage, 0, 0, canvas.width, canvas.height);
        
        // Zastosowanie naszej nowej czcionki z pliku
        ctx.font = '40px "RecznePismo", sans-serif'; 
        ctx.fillStyle = '#1e3a8a'; // Kolor ciemnoniebieskiego długopisu
        
        const sygnatura = `AG-${new Date().getFullYear()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

        ctx.fillText(sygnatura, 550, 275); 
        ctx.fillText(data.imie, 120, 355); 
        ctx.fillText(data.nazwisko, 600, 355);
        ctx.fillText(data.dataUr, 260, 395);
        ctx.fillText(data.ssn, 330, 435);
        ctx.fillText(data.adres, 420, 475);
        ctx.fillText(data.dataZgonu, 450, 545);
        ctx.fillText(data.godzinaZgonu, 850, 545);
        ctx.fillText(data.miejsceZgonu, 440, 585);
        ctx.fillText(data.typMiejsca, 240, 625); 
        
        // Mniejsza czcionka do opisów obrażeń
        ctx.font = '32px "RecznePismo", sans-serif'; 
        ctx.fillText(data.bezposrednia, 80, 710);
        ctx.fillText(data.wyjsciowa, 80, 780);
        ctx.fillText(data.opis, 80, 850);
        
        ctx.font = '40px "RecznePismo", sans-serif';
        ctx.fillText(data.sekcja === 'TAK' ? 'X' : '', 450, 955); 
        ctx.fillText(data.sekcja === 'NIE' ? 'X' : '', 560, 955); 

        ctx.fillText(data.stopien, 380, 1025);
        ctx.fillText(data.lekarz, 300, 1065);
        ctx.fillText(data.odznaka, 420, 1105);
        ctx.fillText(data.dataSporzadzenia, 400, 1145);
        ctx.fillText(data.podpis, 440, 1225); 

        ctx.drawImage(stampImage, 750, 1000, 250, 250); 

        const buffer = canvas.toBuffer('image/png');
        const attachment = new AttachmentBuilder(buffer, { name: `${sygnatura}.png` });

        const embed = new EmbedBuilder()
            .setTitle(`📜 Wystawiono Nowy Akt Zgonu: ${sygnatura}`)
            .setDescription(`**Zmarły:** ${data.imie} ${data.nazwisko}\n**Lekarz:** ${data.stopien} ${data.lekarz} (${data.odznaka})`)
            .setColor(0x000000)
            .setTimestamp();

        const kanal = await client.channels.fetch(channelsConfig.aktZgonu);
        await kanal.send({ embeds: [embed], files: [attachment] });

        res.status(200).send({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).send({ error: 'Błąd generowania' });
    }
});

client.on('interactionCreate', async interaction => {
    
    if (interaction.isChatInputCommand() && interaction.commandName === 'podania') {
        if (!interaction.memberPermissions.has('Administrator')) return interaction.reply({ content: 'Brak uprawnień.', ephemeral: true });
        channelsConfig.podania = interaction.options.getChannel('kanal_podan').id;
        channelsConfig.wyniki = interaction.options.getChannel('kanal_wynikow').id;
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(channelsConfig));
        await interaction.reply({ content: `✅ Kanały skonfigurowane pomyślnie!`, ephemeral: true });
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'ustawaktzgonu') {
        if (!interaction.memberPermissions.has('Administrator')) return interaction.reply({ content: 'Brak uprawnień.', ephemeral: true });
        channelsConfig.aktZgonu = interaction.options.getChannel('kanal_aktu').id;
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(channelsConfig));
        await interaction.reply({ content: `✅ Akty Zgonu będą wysyłane na <#${channelsConfig.aktZgonu}>!`, ephemeral: true });
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'konto') {
        if (!interaction.memberPermissions.has('Administrator')) return interaction.reply({ content: 'Brak uprawnień.', ephemeral: true });
        const subCmd = interaction.options.getSubcommand();

        if (subCmd === 'dodaj') {
            const login = interaction.options.getString('login');
            const haslo = interaction.options.getString('haslo');
            kontaConfig[login] = haslo;
            fs.writeFileSync(KONTA_FILE, JSON.stringify(kontaConfig));
            await interaction.reply({ content: `✅ Utworzono konto.\n**Login:** ${login}\n**Hasło:** ${haslo}`, ephemeral: true });
        }
        else if (subCmd === 'usun') {
            const login = interaction.options.getString('login');
            if (kontaConfig[login]) {
                delete kontaConfig[login];
                fs.writeFileSync(KONTA_FILE, JSON.stringify(kontaConfig));
                await interaction.reply({ content: `✅ Usunięto konto: **${login}**`, ephemeral: true });
            } else {
                await interaction.reply({ content: `❌ Nie znaleziono konta: ${login}`, ephemeral: true });
            }
        }
        else if (subCmd === 'lista') {
            const loginy = Object.keys(kontaConfig);
            if (loginy.length === 0) return interaction.reply({ content: 'Brak kont.', ephemeral: true });
            await interaction.reply({ content: `📝 **Lista kont (loginy):**\n${loginy.map(l => `- ${l}`).join('\n')}`, ephemeral: true });
        }
    }

    if (interaction.isButton()) {
        const [action, discordNick] = interaction.customId.split('_');
        if (action === 'done') return; 

        if (!channelsConfig.wyniki) return interaction.reply({ content: 'Ustaw kanał wyników!', ephemeral: true });

        const wynikiChannel = await client.channels.fetch(channelsConfig.wyniki);

        const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('done_accept').setLabel(action === 'accept' ? 'ZAAKCEPTOWANE' : 'ZAAKCEPTUJ').setStyle(action === 'accept' ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(true),
            new ButtonBuilder().setCustomId('done_reject').setLabel(action === 'reject' ? 'ODRZUCONE' : 'ODRZUĆ').setStyle(action === 'reject' ? ButtonStyle.Danger : ButtonStyle.Secondary).setDisabled(true),
        );
        await interaction.update({ components: [disabledRow] });

        const resultEmbed = new EmbedBuilder()
            .setTitle('🩺 DECYZJA REKRUTACYJNA EMS')
            .setDescription(`Podanie gracza: **${discordNick}** zostało rozpatrzone.`)
            .addFields(
                { name: 'Status:', value: action === 'accept' ? '✅ **ZAAKCEPTOWANE**' : '❌ **ODRZUCONE**' },
                { name: 'Rozpatrzył:', value: `<@${interaction.user.id}>` }
            )
            .setColor(action === 'accept' ? 0x10b981 : 0xef4444);

        await wynikiChannel.send({ embeds: [resultEmbed] });
    }
});

client.once('ready', async () => {
    console.log(`Bot zalogowany jako ${client.user.tag}`);
    const commands = [
        {
            name: 'podania', description: 'Konfiguracja kanałów', options: [
                { name: 'kanal_podan', type: 7, description: 'Kanał na podania', required: true },
                { name: 'kanal_wynikow', type: 7, description: 'Kanał na wyniki', required: true }
            ]
        },
        {
            name: 'ustawaktzgonu', description: 'Ustaw kanał Aktów Zgonu', options: [
                { name: 'kanal_aktu', type: 7, description: 'Wybierz kanał', required: true }
            ]
        },
        {
            name: 'konto', description: 'Zarządzanie kontami ratowników na stronę WWW', options: [
                { name: 'dodaj', type: 1, description: 'Nowe konto', options: [{ name: 'login', type: 3, description: 'Login', required: true }, { name: 'haslo', type: 3, description: 'Hasło', required: true }] },
                { name: 'usun', type: 1, description: 'Usuń konto', options: [{ name: 'login', type: 3, description: 'Login', required: true }] },
                { name: 'lista', type: 1, description: 'Lista kont' }
            ]
        }
    ];
    await client.application.commands.set(commands);
});

app.listen(PORT, () => {
    console.log(`Serwer wystartował na porcie ${PORT}`);
    client.login(BOT_TOKEN);
});
