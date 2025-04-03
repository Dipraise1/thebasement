#!/usr/bin/env python3
import os
import time
import logging
import json
import schedule
import asyncio
import traceback
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Union
from dotenv import load_dotenv
from solana.rpc.api import Client
from solana.keypair import Keypair
from solana.publickey import PublicKey
from solana.transaction import Transaction
from solana.rpc.types import TxOpts
from anchorpy import Provider, Program, Wallet, Context
import requests

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("keeper.log"),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger(__name__)

# Constants
RPC_URL = os.getenv("RPC_URL", "https://api.devnet.solana.com")
PROGRAM_ID = os.getenv("PROGRAM_ID")
PRIVATE_KEY_PATH = os.getenv("PRIVATE_KEY_PATH", "~/.config/solana/id.json")
PYTH_SOL_USD_ACCOUNT = os.getenv("PYTH_SOL_USD_ACCOUNT")
SWITCHBOARD_SOL_USD_ACCOUNT = os.getenv("SWITCHBOARD_SOL_USD_ACCOUNT")  # Backup oracle
YIELD_FARM_ADDRESS = os.getenv("YIELD_FARM_ADDRESS")
TOKEN_MINT = os.getenv("TOKEN_MINT")
REFRESH_INTERVAL = int(os.getenv("REFRESH_INTERVAL", "3600"))  # Default 1 hour
DEX_API_URLS = json.loads(os.getenv("DEX_API_URLS", "{}"))  # DEX API URLs for yield data
ALERT_THRESHOLD = float(os.getenv("ALERT_THRESHOLD", "5.0"))  # 5% price movement threshold

# Initialize Solana client
client = Client(RPC_URL)

# Load keeper wallet
def load_keypair(keypair_path):
    """Load a keypair from a file."""
    try:
        expanded_path = os.path.expanduser(keypair_path)
        with open(expanded_path, 'r') as f:
            secret_key = json.load(f)
        return Keypair.from_secret_key(bytes(secret_key))
    except Exception as e:
        logger.error(f"Failed to load keypair: {e}")
        raise

try:
    keypair = load_keypair(PRIVATE_KEY_PATH)
    wallet = Wallet(keypair)
    provider = Provider(client, wallet)
    logger.info(f"Keeper wallet initialized: {keypair.public_key}")
except Exception as e:
    logger.error(f"Failed to load wallet: {e}")
    exit(1)

# Load IDL for our program
def load_program(program_id):
    """Load the program from the program ID."""
    try:
        with open("../target/idl/the_basement.json", "r") as f:
            idl = json.load(f)
        
        program_id_public_key = PublicKey(program_id)
        program = Program(idl, program_id_public_key, provider)
        return program
    except Exception as e:
        logger.error(f"Failed to load program: {e}")
        raise

try:
    program = load_program(PROGRAM_ID)
    logger.info("Program loaded successfully")
except Exception as e:
    logger.error(f"Error loading program: {e}")
    exit(1)

# Price tracking for trend analysis
price_history = []
MAX_PRICE_HISTORY = 24  # Keep 24 hours of hourly price data

class PriceService:
    """Service to fetch and track token prices from multiple sources."""
    
    @staticmethod
    async def get_sol_price_from_pyth() -> Optional[float]:
        """Fetch SOL price from Pyth."""
        try:
            pyth_price_account = PublicKey(PYTH_SOL_USD_ACCOUNT)
            account_info = client.get_account_info(pyth_price_account)
            
            if not account_info.value:
                logger.warning("Pyth price account not found")
                return None
            
            # In a real implementation, properly decode the Pyth price data
            # Here we'll use CoinGecko as a simpler substitute
            response = requests.get('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd')
            price_data = response.json()
            sol_price = price_data['solana']['usd']
            
            logger.info(f"Pyth SOL price: ${sol_price:.2f}")
            return sol_price
        except Exception as e:
            logger.error(f"Error fetching Pyth price: {e}")
            return None
    
    @staticmethod
    async def get_sol_price_from_switchboard() -> Optional[float]:
        """Fetch SOL price from Switchboard as backup."""
        try:
            if not SWITCHBOARD_SOL_USD_ACCOUNT:
                logger.warning("Switchboard account not configured")
                return None
                
            switchboard_price_account = PublicKey(SWITCHBOARD_SOL_USD_ACCOUNT)
            account_info = client.get_account_info(switchboard_price_account)
            
            if not account_info.value:
                logger.warning("Switchboard price account not found")
                return None
            
            # In a real implementation, properly decode the Switchboard price data
            # Here we'll use CoinGecko as a simpler substitute
            response = requests.get('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd')
            price_data = response.json()
            sol_price = price_data['solana']['usd']
            
            logger.info(f"Switchboard SOL price: ${sol_price:.2f}")
            return sol_price
        except Exception as e:
            logger.error(f"Error fetching Switchboard price: {e}")
            return None
    
    @staticmethod
    async def get_sol_price_from_cex() -> Optional[float]:
        """Fetch SOL price from centralized exchange API as last resort."""
        try:
            # Using Binance API as fallback
            response = requests.get('https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT')
            price_data = response.json()
            sol_price = float(price_data['price'])
            
            logger.info(f"CEX SOL price: ${sol_price:.2f}")
            return sol_price
        except Exception as e:
            logger.error(f"Error fetching CEX price: {e}")
            return None
    
    @classmethod
    async def get_sol_price(cls) -> Optional[float]:
        """Get SOL price with fallback mechanisms."""
        # Try primary oracle first
        price = await cls.get_sol_price_from_pyth()
        if price is not None:
            return price
            
        # Try secondary oracle if primary fails
        price = await cls.get_sol_price_from_switchboard()
        if price is not None:
            return price
            
        # Use CEX as last resort
        price = await cls.get_sol_price_from_cex()
        return price
    
    @staticmethod
    def detect_significant_price_movement(current_price: float) -> bool:
        """Detect if there's a significant price movement based on history."""
        global price_history
        
        # Add current price to history
        timestamp = datetime.now()
        price_history.append((timestamp, current_price))
        
        # Keep only recent history
        price_history = price_history[-MAX_PRICE_HISTORY:]
        
        # Need at least 2 data points
        if len(price_history) < 2:
            return False
            
        # Calculate percentage change from oldest to newest
        oldest_price = price_history[0][1]
        percentage_change = abs((current_price - oldest_price) / oldest_price * 100)
        
        # Log the movement
        logger.info(f"Price movement: {percentage_change:.2f}% over {len(price_history)} intervals")
        
        # Check if movement exceeds threshold
        significant = percentage_change > ALERT_THRESHOLD
        if significant:
            logger.warning(f"Significant price movement detected: {percentage_change:.2f}%")
        
        return significant

class DexService:
    """Service to interact with DEX APIs for yield data."""
    
    @staticmethod
    async def get_dex_yields() -> Dict[str, Dict[str, float]]:
        """Get yields from various DEXes for different bin types."""
        yields_data = {
            "large_bin": {},
            "medium_bin": {},
            "small_bin": {}
        }
        
        # In a production app, this would query actual DEX APIs
        # For demonstration, we'll use mock data
        try:
            # Process each DEX API
            for dex_name, api_url in DEX_API_URLS.items():
                try:
                    # In a real implementation, we would make an API call
                    # response = requests.get(api_url)
                    # data = response.json()
                    
                    # Using mock data for demonstration
                    mock_data = {
                        "large_bin": 0.045 + (hash(dex_name) % 100) / 1000,  # 4.5% + random variation
                        "medium_bin": 0.063 + (hash(dex_name) % 100) / 1000,  # 6.3% + random variation
                        "small_bin": 0.082 + (hash(dex_name) % 100) / 1000,   # 8.2% + random variation
                    }
                    
                    # Store yields for this DEX
                    for bin_type, apy in mock_data.items():
                        yields_data[bin_type][dex_name] = apy
                        
                except Exception as e:
                    logger.error(f"Error fetching yield data from {dex_name}: {e}")
            
            # Calculate average yields across DEXes
            avg_yields = {}
            for bin_type, dex_yields in yields_data.items():
                if dex_yields:
                    avg_yields[bin_type] = sum(dex_yields.values()) / len(dex_yields)
                else:
                    avg_yields[bin_type] = 0
            
            logger.info(f"Current BIN yields: {avg_yields}")
            return yields_data
        except Exception as e:
            logger.error(f"Error in get_dex_yields: {e}")
            return yields_data

class YieldFarmService:
    """Service to interact with the yield farm contract."""
    
    @staticmethod
    async def get_yield_farm_data():
        """Fetch yield farm account data."""
        try:
            yield_farm_public_key = PublicKey(YIELD_FARM_ADDRESS)
            yield_farm = await program.account["yieldFarm"].fetch(yield_farm_public_key)
            
            logger.info(f"Yield farm data retrieved: Total deposits = {yield_farm.total_deposits}")
            return yield_farm
        except Exception as e:
            logger.error(f"Error fetching yield farm data: {e}")
            return None
    
    @staticmethod
    async def compound_rewards():
        """Compound rewards across all BINs."""
        try:
            # Build transaction to call compound_rewards on the smart contract
            transaction = Transaction()
            
            # Get yield farm account
            yield_farm_public_key = PublicKey(YIELD_FARM_ADDRESS)
            
            # Create instruction
            instruction = program.instruction["compoundRewards"](
                ctx=Context(
                    accounts={
                        "keeper": keypair.public_key,
                        "yieldFarm": yield_farm_public_key
                    },
                    signers=[keypair],
                    options=TxOpts(skip_preflight=True)
                ),
            )
            
            transaction.add(instruction)
            
            # Send transaction
            result = await client.send_transaction(transaction, keypair)
            logger.info(f"Compounded rewards. Transaction: {result.value}")
            return True
        except Exception as e:
            logger.error(f"Error compounding rewards: {e}")
            traceback.print_exc()
            return False
    
    @staticmethod
    async def rebalance_deposits(price_movement: bool, dex_yields: Dict[str, Dict[str, float]]):
        """Rebalance deposits based on current market conditions."""
        try:
            # Determine if rebalancing is needed based on price movement and yields
            # In a real implementation, we would have more sophisticated logic
            should_rebalance = price_movement
            
            # Check if small bins have much higher yields than large bins
            if dex_yields and "small_bin" in dex_yields and "large_bin" in dex_yields:
                # Calculate average yields for each bin type
                small_bin_avg = sum(dex_yields["small_bin"].values()) / max(1, len(dex_yields["small_bin"]))
                large_bin_avg = sum(dex_yields["large_bin"].values()) / max(1, len(dex_yields["large_bin"]))
                
                # Rebalance if small bins have significantly higher yield
                yield_diff = small_bin_avg - large_bin_avg
                if yield_diff > 0.03:  # 3% yield difference threshold
                    should_rebalance = True
                    logger.info(f"Rebalance triggered by yield differential: {yield_diff:.2%}")
            
            if not should_rebalance:
                logger.info("Rebalancing not needed at this time")
                return True
            
            # Build transaction to call rebalance on the smart contract
            transaction = Transaction()
            
            # Get yield farm account
            yield_farm_public_key = PublicKey(YIELD_FARM_ADDRESS)
            
            # Create instruction
            instruction = program.instruction["rebalance"](
                ctx=Context(
                    accounts={
                        "keeper": keypair.public_key,
                        "yieldFarm": yield_farm_public_key
                    },
                    signers=[keypair],
                    options=TxOpts(skip_preflight=True)
                ),
            )
            
            transaction.add(instruction)
            
            # Send transaction
            result = await client.send_transaction(transaction, keypair)
            logger.info(f"Rebalanced deposits. Transaction: {result.value}")
            return True
        except Exception as e:
            logger.error(f"Error rebalancing deposits: {e}")
            traceback.print_exc()
            return False

async def keeper_job():
    """Run the main keeper job."""
    logger.info("Starting keeper job")
    
    try:
        # Get SOL price
        sol_price = await PriceService.get_sol_price()
        if not sol_price:
            logger.warning("Skipping job due to price fetching error")
            return
        
        # Detect significant price movements
        significant_price_movement = PriceService.detect_significant_price_movement(sol_price)
        
        # Get yield farm data
        yield_farm = await YieldFarmService.get_yield_farm_data()
        if not yield_farm:
            logger.warning("Skipping job due to yield farm data error")
            return
        
        # Get DEX yields
        dex_yields = await DexService.get_dex_yields()
        
        # Compound rewards
        compound_success = await YieldFarmService.compound_rewards()
        if not compound_success:
            logger.warning("Reward compounding failed")
        
        # Rebalance if needed
        rebalance_success = await YieldFarmService.rebalance_deposits(
            significant_price_movement,
            dex_yields
        )
        if not rebalance_success:
            logger.warning("Rebalancing failed")
        
        logger.info("Keeper job completed successfully")
    except Exception as e:
        logger.error(f"Keeper job failed: {e}")
        traceback.print_exc()

def run_keeper_job():
    """Run the keeper job, handling the asyncio event loop."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(keeper_job())
    finally:
        loop.close()

# Schedule the keeper job
def run_scheduler():
    """Schedule and run the keeper job."""
    logger.info(f"Starting keeper bot. Refresh interval: {REFRESH_INTERVAL} seconds")
    
    # Run once at startup
    run_keeper_job()
    
    # Schedule regular runs
    schedule.every(REFRESH_INTERVAL).seconds.do(run_keeper_job)
    
    # Keep the script running
    while True:
        schedule.run_pending()
        time.sleep(1)

if __name__ == "__main__":
    run_scheduler() 