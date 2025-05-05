
cd /usr/local
sudo wget https://nodejs.org/dist/v20.5.0/node-v20.5.0-linux-x64.tar.xz
sudo tar -xf node-v20.5.0-linux-x64.tar.xz
sudo mv node-v20.5.0-linux-x64 nodejs
sudo ln -sf /usr/local/nodejs/bin/node /usr/local/bin/node
sudo ln -sf /usr/local/nodejs/bin/npm /usr/local/bin/npm
sudo ln -sf /usr/local/nodejs/bin/npx /usr/local/bin/npx

sudo apt update
sudo apt install -y software-properties-common
sudo add-apt-repository -y ppa:ubuntu-toolchain-r/test
sudo apt update
sudo apt install -y gcc-13 g++-13
sudo apt install -y gdb

cat ~/hedgeware/env/my_bashrc.sh >> ~/.bashrc
source ~/.bashrc

cd ~/hedgeware

npm install -g yarn@1.22.19
yarn install
