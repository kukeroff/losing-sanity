async function initializeTon() {
    const endpoint = await tonAccess.getHttpEndpoint();
    window.client = new tonton.TonClient({ endpoint: endpoint });
}

const wrapAddress = (address) => {
    const addressString = address.toString();
    return `${addressString.slice(0, 6)}...${addressString.slice(-6)}`;
}

async function initializeWallet(seedphrase) {
    // Splitting the seedphrase into an array of words
    let seedWords = seedphrase.split(' ');

    // Convert mnemonic to keyPair
    let keyPair = await tonCrypto.mnemonicToPrivateKey(seedWords);

    // Create wallet contract
    let workchain = 0; // Usually you need a workchain 0
    let wallet = tonton.WalletContractV4.create({
        workchain,
        publicKey: keyPair.publicKey,
    });
    window.userWallet = client.open(wallet);
    window.userSender = userWallet.sender(keyPair.secretKey);

    console.log('Wallet address:', userWallet.address.toString());

    // set address to view
    document.getElementById('address').innerHTML = `Your address: <a href="https://tonscan.org/address/${userWallet.address.toString()}" 
                target="_blank">${wrapAddress(userWallet.address)}</a>`;

}

async function initializeJettonGiver(jettonGiverAddress) {
    const parsedAddress = tonton.Address.parse(jettonGiverAddress);
    window.jettonGiver = client.open(
        window.JettonGiver.createFromAddress(parsedAddress)
    );
}

const extraSmallGivers = [
    'EQDSGvoktoIRTL6fBEK_ysS8YvLoq3cqW2TxB_xHviL33ex2',
    'EQCvMmHhSYStEtUAEDrpV39T2GWl-0K-iqCxSSZ7I96L4yow',
    'EQBvumwjKe7xlrjc22p2eLGT4UkdRnrmqmcEYT94J6ZCINmt',
    'EQDEume45yzDIdSy_Cdz7KIKZk0HyCFIr0yKdbtMyPfFUkbl',
    'EQAO7jXcX-fJJZl-kphbpdhbIDUqcAiYcAr9RvVlFl38Uatt',
    'EQAvheS_G-U57CE55UlwF-3M-cc4cljbLireYCmAMe_RHWGF',
    'EQCba5q9VoYGgiGykVazOUZ49UK-1RljUeZgU6E-bW0bqF2Z',
    'EQCzT8Pk1Z_aMpNukdV-Mqwc6LNaCNDt-HD6PiaSuEeCD0hV',
    'EQDglg3hI89dySlr-FR_d1GQCMirkLZH6TPF-NeojP-DbSgY',
    'EQDIDs45shbXRwhnXoFZg303PkG2CihbVvQXw1k0_yVIqxcA',
]

const getRandomGiver = () => {
    return extraSmallGivers[Math.floor(Math.random() * extraSmallGivers.length)];
}

const getGiverToMine = () => {
    const value = document.getElementById('extraSmallGivers').value
    if (value === 'random') {
        return getRandomGiver();
    }
    return value;
}

const updateGiver = () => {
    if (!localStorage.getItem('cryptoSeedphrase')) {
        return false
    }
    const giver = getGiverToMine();
    localStorage.setItem('jettonGiverAddress', giver);
    console.log('Updated giver:', giver);
    initializeJettonGiver(giver); // Initialize JettonGiver with the new address
}

window.addEventListener('load', async function () {
    await initializeTon();
    updateView();
    let currentSeed = null;
    let currentPowComplexity = null;
    let isMining = false;
    let lastSentSeed = null;

    // Initialize pow parameters and start the update loop
    await updatePowParameters();
    setInterval(updatePowParameters, 5000); // Update parameters every 5 seconds, adjust as needed

    async function updatePowParameters() {
        updateGiver()
        if (!window.jettonGiver) {
            console.log('No JettonGiver found, skipping update.');
            return false;
        }
        if (!localStorage.getItem('jettonGiverAddress')) {
            console.log('No JettonGiver address found, skipping update.');
            return false;
        }
        try {
            const [seed, powComplexity] = await jettonGiver.getPowParameters();
            currentSeed = seed;
            currentPowComplexity = powComplexity;
            console.log(
                'Updated pow parameters:',
                currentSeed,
                currentPowComplexity
            );
        } catch (error) {
            console.error('Error fetching pow parameters:', error);
        }
    }

    async function simpleMine(myAddress) {
        let startMiningTime = Date.now()
        let lastSentLogTime = 0

        let nonce = BigInt(
            '0x' + (await tonCrypto.getSecureRandomBytes(16)).toString('hex')
        );
        const expire = Math.floor(Date.now() / 1000) + 900;

        const b = tonton
            .beginCell()
            .storeUint(0x4d696e65, 32) // Magic number for 'Mine'
            .storeInt(myAddress.workChain * 4, 8)
            .storeUint(expire, 32)
            .storeBuffer(myAddress.hash);

        while (isMining) {
            const cell = tonton
                .beginCell()
                .storeBuilder(b)
                .storeUint(nonce, 256)
                .storeUint(currentSeed, 128)
                .storeUint(nonce, 256)
                .endCell();
            const hash = cell.hash();
            const hashNumber = BigInt(`0x${hash.toString('hex')}`);
            const randomNumber = Math.floor(Math.random() * 700) + 300;
            if (Date.now() - lastSentLogTime > randomNumber) {
                lastSentLogTime = Date.now()
                console.log('Mining... Time left:', ((Date.now() - startMiningTime) / 1000).toFixed(2), 's', hashNumber)

            }
            if (hashNumber < currentPowComplexity) {
                console.log(
                    'Mining successful!',
                    hashNumber,
                    currentPowComplexity
                );
                console.log(
                    nonce,
                    expire,
                    userWallet.address.toString(),
                    currentSeed.toString(),
                    currentPowComplexity.toString(),
                    cell.toString()
                );
                return { cell, nonce }; // Return the successful cell and nonce
            }
            nonce++;

            // Optional: Insert a short delay or perform other tasks
            await new Promise((resolve) => setTimeout(resolve, 0)); // Non-blocking delay
        }

        // If mining stopped, return null
        return null;
    }

    // Function to update the view based on connection status
    function updateView() {
        var storedSeedphrase = localStorage.getItem('cryptoSeedphrase');
        var storedJettonGiverAddress =
            localStorage.getItem('jettonGiverAddress');
        if (storedSeedphrase && storedJettonGiverAddress) {
            initializeWallet(storedSeedphrase);
            initializeJettonGiver(storedJettonGiverAddress); // Initialize JettonGiver with stored address


            document.getElementById('content').innerHTML = `
                <p id="address">Your address: ...</p>
                <select id="extraSmallGivers"></select>
                <!--input type="text" id="jettonGiverAddress" value="${storedJettonGiverAddress}"-->
                <button id="miningButton">Start Mining</button>
                <button id="disconnectButton">Disconnect</button>
            `;
            const select = document.getElementById('extraSmallGivers');
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.disabled = true;
            defaultOption.text = 'Select Extra Small Jetton Giver';
            select.appendChild(defaultOption);
            // add option random giver
            const optionRandom = document.createElement('option');
            optionRandom.value = 'random';
            optionRandom.text = 'Random giver';
            select.appendChild(optionRandom);
            extraSmallGivers.forEach((address) => {
                const option = document.createElement('option');
                option.value = address;
                option.text = address;
                select.appendChild(option);
            });
            // change giver when select
            select.addEventListener('change', updateGiver);
            document
                .getElementById('disconnectButton')
                .addEventListener('click', function () {
                    localStorage.removeItem('cryptoSeedphrase');
                    stopMining(); // Stop mining when disconnecting
                    updateView();
                });

            document
                .getElementById('miningButton')
                .addEventListener('click', function () {
                    updateGiver()
                    isMining = !isMining;
                    updateMiningButton();
                    if (isMining) {
                        startMining();
                    } else {
                        stopMining();
                    }
                });


            // document.getElementById('jettonGiverAddress').addEventListener('change', function () {
            //     var jettonGiverAddress = document.getElementById('jettonGiverAddress').value;
            //     if (jettonGiverAddress) {
            //         localStorage.setItem('jettonGiverAddress', jettonGiverAddress);
            //         initializeJettonGiver(jettonGiverAddress); // Initialize JettonGiver with the new address
            //         updateView();
            //     } else {
            //         alert('Please enter a JettonGiver address');
            //     }
            // })
        } else {
            document.getElementById('content').innerHTML = `
                <input type="text" id="seedphrase" placeholder="Enter Seedphrase">
                <!--input type="text" id="jettonGiverAddress" placeholder="Enter JettonGiver Address"-->
                <button id="connectButton">Start Mining</button>
            `;
            document
                .getElementById('connectButton')
                .addEventListener('click', function () {
                    var seedphrase =
                        document.getElementById('seedphrase').value;
                    // var jettonGiverAddress =
                    //     document.getElementById('jettonGiverAddress').value;
                    if (seedphrase/* && jettonGiverAddress*/) {
                        const jettonGiverAddress = getRandomGiver();
                        localStorage.setItem('cryptoSeedphrase', seedphrase);
                        localStorage.setItem(
                            'jettonGiverAddress',
                          jettonGiverAddress
                        );
                        initializeJettonGiver(jettonGiverAddress); // Initialize JettonGiver with the new address
                        updateView();
                        // miningButton click
                        updateGiver()
                        document.getElementById('miningButton').click();
                    } else {
                        alert(
                            'Please enter a seedphrase'
                        );
                    }
                });
        }
    }

    function updateMiningButton() {
        var miningButton = document.getElementById('miningButton');
        miningButton.textContent = isMining ? 'Stop Mining' : 'Start Mining';
    }

    async function startMining() {
        console.log('Mining started...');

        updateGiver()

        while (isMining) {
            if (lastSentSeed === currentSeed) {
                console.log('Mining unsuccessful, trying again...');
                await new Promise((resolve) => setTimeout(resolve, 1000)); // Delay to prevent blocking
                continue;
            }

            const result = await simpleMine(userWallet.address);
            if (result) {
                const { cell, nonce } = result;
                console.log(`Mining successful: Nonce - ${nonce}`, cell);
                try {
                    await jettonGiver.sendMine(
                        userSender,
                        tonton.toNano('0.05'),
                        cell
                    );
                    lastSentSeed = currentSeed;
                    console.log('Sent!');
                } catch (error) {
                    console.error('Error sending mined data:', error);
                }
            } else {
                console.log('Mining unsuccessful, trying again...');
            }

            await new Promise((resolve) => setTimeout(resolve, 1000)); // Delay to prevent blocking
        }
        console.log('Mining stopped.');
    }

    function stopMining() {
        console.log('Mining stopped.');
    }
});
