from slowapi import Limiter
from slowapi.util import get_remote_address

# Lives in its own module so routers can import it without creating a
# circular import with app.main (which also needs it to wire up the
# exception handler and app.state).
limiter = Limiter(key_func=get_remote_address)