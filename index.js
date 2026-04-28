const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { createCanvas, loadImage, registerFont } = require('canvas');

// ================= USTAWIENIA =================
const BOT_TOKEN = process.env.BOT_TOKEN; 
const PORT = process.env.PORT || 3000;
// ==============================================

if (fs.existsSync('./font.ttf')) {
    registerFont('./font.ttf', { family: 'RecznePismo' });
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const app = express();

app.use(cors());
app.use(express.json());

const CONFIG_FILE = './config.json';
let channelsConfig = { podania: null, wyniki: null, aktZgonu: null };
if (fs.existsSync(CONFIG_FILE)) { channelsConfig = JSON.parse(fs.readFileSync(CONFIG_FILE)); } 
else { fs.writeFileSync(CONFIG_FILE, JSON.stringify(channelsConfig)); }

const KONTA_FILE = './konta.json';
let kontaConfig = {};
if (fs.existsSync(KONTA_FILE)) { kontaConfig = JSON.parse(fs.readFileSync(KONTA_FILE)); } 
else { kontaConfig = { "Zarzad": "EMS123" }; fs.writeFileSync(KONTA_FILE, JSON.stringify(kontaConfig)); }

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
    } catch (e) { res.status(500).send({ error: 'Błąd serwera' }); }
});

// --- API 2: LOGOWANIE ---
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (kontaConfig[username] && kontaConfig[username] === password) res.status(200).send({ success: true });
    else res.status(401).send({ success: false });
});

// --- API 3: AKT ZGONU (GENEROWANIE KARTKI OD ZERA) ---
app.post('/api/akt-zgonu', async (req, res) => {
    try {
        if (!channelsConfig.aktZgonu) return res.status(400).send({ error: 'Brak kanału!' });
        const data = req.body;
        
        // 1. Sztywna rozdzielczość kartki A4
        const W = 1200;
        const H = 1600;
        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext('2d');
        
        // Tło kartki (delikatnie kremowa biel)
        ctx.fillStyle = '#fcfbf7'; 
        ctx.fillRect(0, 0, W, H);
        
        // 2. Ładowanie Logo EMS i Pieczątki
        try {
            const emsLogo = await loadImage('./logo.png');
            // Rysujemy logo na górze, na środku
            ctx.drawImage(emsLogo, W/2 - 75, 40, 150, 150); 
        } catch (e) {
            console.log("Brak pliku logo.png na GitHubie, pomijam logo.");
        }

        // 3. Nagłówek dokumentu
        ctx.fillStyle = '#000000'; 
        ctx.textAlign = 'center';
        
        ctx.font = 'bold 38px sans-serif';
        ctx.fillText('LOS SANTOS EMERGENCY MEDICAL SERVICES', W/2, 230);
        ctx.font = '24px sans-serif';
        ctx.fillText('Wydział Medycyny Sądowej i Patologii', W/2, 270);
        ctx.fillText('Departament Koronera', W/2, 305);
        
        ctx.font = 'bold 48px sans-serif';
        ctx.fillText('OFICJALNY AKT ZGONU (KARTA ZGONU)', W/2, 380);
        
        const sygnatura = `AG-${new Date().getFullYear()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
        ctx.font = '22px sans-serif';
        ctx.fillText(`Sygnatura akt: ${sygnatura}`, W/2, 420);

        // Kreska oddzielająca
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(80, 440); ctx.lineTo(1120, 440); ctx.stroke();
        
        // 4. Mechanizm pisania (Czarny Druk + Niebieskie Pismo Odręczne)
        ctx.textAlign = 'left';
        
        function drawField(label, value, x, y, customFont = '45px') {
            // Czarny druk (pytanie)
            ctx.font = 'bold 24px sans-serif';
            ctx.fillStyle = '#000000';
            ctx.fillText(label, x, y);
            
            // Obliczamy gdzie kończy się pytanie, żeby zacząć odpowiedź
            const labelWidth = ctx.measureText(label).width;
            
            // Niebieski długopis (odpowiedź)
            ctx.font = `${customFont} "RecznePismo", cursive, sans-serif`;
            ctx.fillStyle = '#1e3a8a'; 
            ctx.fillText(value || 'Brak danych', x + labelWidth + 15, y);
        }

        // --- CZĘŚĆ I ---
        ctx.font = 'bold 28px sans-serif';
        ctx.fillStyle = '#000000';
        ctx.fillText('CZĘŚĆ I: DANE IDENTYFIKACYJNE ZMARŁEGO', 80, 500);
        
        drawField('Imię:', data.imie, 80, 550);
        drawField('Nazwisko:', data.nazwisko, 600, 550);
        drawField('Data urodzenia:', data.dataUr, 80, 600);
        drawField('Numer SSN:', data.ssn, 600, 600);
        drawField('Ostatni adres zamieszkania:', data.adres, 80, 650);

        ctx.beginPath(); ctx.moveTo(80, 680); ctx.lineTo(1120, 680); ctx.stroke();

        // --- CZĘŚĆ II ---
        ctx.font = 'bold 28px sans-serif';
        ctx.fillStyle = '#000000';
        ctx.fillText('CZĘŚĆ II: CZAS I MIEJSCE ZGONU', 80, 730);
        
        drawField('Data zgonu:', data.dataZgonu, 80, 780);
        drawField('Godzina:', data.godzinaZgonu, 600, 780);
        drawField('Miejsce zgonu (adres):', data.miejsceZgonu, 80, 830);
        drawField('Zgon nastąpił w:', data.typMiejsca, 80, 880);

        ctx.beginPath(); ctx.moveTo(80, 910); ctx.lineTo(1120, 910); ctx.stroke();

        // --- CZĘŚĆ III ---
        ctx.font = 'bold 28px sans-serif';
        ctx.fillStyle = '#000000';
        ctx.fillText('CZĘŚĆ III: PRZYCZYNA ZGONU', 80, 960);
        
        drawField('1. Bezpośrednia przyczyna zgonu:', data.bezposrednia, 80, 1010, '35px');
        drawField('2. Wyjściowa przyczyna zgonu:', data.wyjsciowa, 80, 1060, '35px');
        drawField('3. Krótki opis obrażeń:', data.opis, 80, 1110, '35px');
        drawField('Czy przeprowadzono sekcję zwłok?', data.sekcja, 80, 1160);

        ctx.beginPath(); ctx.moveTo(80, 1190); ctx.lineTo(1120, 1190); ctx.stroke();

        // --- CZĘŚĆ IV ---
        ctx.font = 'bold 28px sans-serif';
        ctx.fillStyle = '#000000';
        ctx.fillText('CZĘŚĆ IV: DANE WYSTAWIAJĄCEGO', 80, 1240);
        
        drawField('Stopień Medyczny:', data.stopien, 80, 1290);
        drawField('Imię i Nazwisko:', data.lekarz, 550, 1290);
        drawField('Numer Odznaki:', data.odznaka, 80, 1340);
        drawField('Data sporządzenia:', data.dataSporzadzenia, 550, 1340);
        
        // Podpis Lekarza na samym dole
        ctx.font = 'bold 26px sans-serif';
        ctx.fillStyle = '#000000';
        ctx.fillText('Czytelny podpis lekarza/koronera:', 80, 1480);
        
        ctx.font = '60px "RecznePismo", cursive, sans-serif';
        ctx.fillStyle = '#1e3a8a';
        ctx.fillText(data.podpis, 500, 1480);

        // 5. Nakładanie pieczątki z pliku w prawym dolnym rogu
        try {
            const stampImage = await loadImage('./stamp.png');
            ctx.drawImage(stampImage, 850, 1250, 280, 280); 
        } catch (e) {
            console.log("Problem z wczytaniem pieczątki stamp.png.");
        }

        // 6. Stopka dokumentu
        ctx.textAlign = 'center';
        ctx.font = 'italic 18px serif';
        ctx.fillStyle = '#4b5563'; // Szary kolor stopki
        ctx.fillText('Dokument stanowi własność stanową San Andreas. Podrabianie, modyfikowanie lub używanie bez', W/2, 1550);
        ctx.fillText('autoryzacji Los Santos Emergency Medical Services podlega karze pozbawienia wolności.', W/2, 1575);

        // 7. Zapis do obrazka i wysłanie na Discord
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
